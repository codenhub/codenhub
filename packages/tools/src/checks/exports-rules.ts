import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { isDocumentedPackage } from "../workspace/package-policy.ts";
import type { CheckRule, Finding } from "./rule.ts";

const README = "README.md";
const PUBLIC_DOCS = "docs/**/*.md";
const INTERNAL_DOCS = "docs/internal/";
// Import statements only. A bare mention of a package path in prose is not a
// claim that the path is importable, and flagging one would punish good writing.
const IMPORT_SPECIFIER = /(?:\bfrom|\bimport|\brequire\s*\(|@import)\s*\(?\s*["']([^"'\n]+)["']/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesExportKey(key: string, subpath: string): boolean {
  const starIndex = key.indexOf("*");
  if (starIndex === -1) {
    return key === subpath;
  }
  const prefix = key.slice(0, starIndex);
  const suffix = key.slice(starIndex + 1);
  return subpath.length >= prefix.length + suffix.length && subpath.startsWith(prefix) && subpath.endsWith(suffix);
}

/**
 * Reports whether a subpath is reachable through a manifest `exports` field.
 * @param exportsField Raw `exports` value.
 * @param subpath Export subpath such as `.` or `./browser`.
 * @returns `true` when a key covers the subpath, including through a `*` pattern.
 */
function isDeclaredSubpath(exportsField: unknown, subpath: string): boolean {
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    return subpath === ".";
  }
  if (!isRecord(exportsField)) {
    return false;
  }
  const keys = Object.keys(exportsField);
  // Sugar form: an object of conditions with no subpath keys declares only the
  // root entrypoint.
  if (!keys.some((key) => key === "." || key.startsWith("./"))) {
    return subpath === ".";
  }
  return keys.some((key) => matchesExportKey(key, subpath));
}

interface DocumentedSurface {
  path: string;
  contents: string;
}

async function readDocumentedSurfaces(rootPath: string): Promise<DocumentedSurface[]> {
  const documents = await Array.fromAsync(glob(PUBLIC_DOCS, { cwd: rootPath }));
  const paths = [
    README,
    ...documents.map((path) => path.replaceAll("\\", "/")).filter((path) => !path.startsWith(INTERNAL_DOCS)),
  ].sort();
  const surfaces = await Promise.all(
    paths.map(async (path) => ({
      contents: await readFile(join(rootPath, path), "utf8").catch(() => undefined),
      path,
    })),
  );
  return surfaces.filter((surface): surface is DocumentedSurface => surface.contents !== undefined);
}

async function checkDocumentedImports(workspacePackage: WorkspacePackage): Promise<Finding[]> {
  const exportsField = workspacePackage.manifest.exports;
  if (exportsField === undefined) {
    // A published package missing `exports` is already a `metadata/exports` finding.
    return [];
  }

  const surfaces = await readDocumentedSurfaces(workspacePackage.directory);
  const findings: Finding[] = [];
  // One finding per undeclared path: repeating it for every example that shows
  // the path would bury the single manifest edit that fixes all of them.
  const reported = new Set<string>();
  for (const { contents, path } of surfaces) {
    for (const [, specifier = ""] of contents.matchAll(IMPORT_SPECIFIER)) {
      if (specifier !== workspacePackage.name && !specifier.startsWith(`${workspacePackage.name}/`)) {
        continue;
      }
      const subpath = specifier === workspacePackage.name ? "." : `.${specifier.slice(workspacePackage.name.length)}`;
      if (isDeclaredSubpath(exportsField, subpath) || reported.has(specifier)) {
        continue;
      }
      reported.add(specifier);
      findings.push({
        code: "exports/undocumented-import",
        location: path,
        message: `Documented import "${specifier}" is not declared in "exports".`,
        severity: "error",
      });
    }
  }
  return findings;
}

/**
 * Creates the rules that keep documented import paths and `exports` in agreement.
 *
 * Only the checkable half of the lifecycle rule is enforced: a supported path
 * missing from `exports` is invisible to any tool, but a path a package
 * documents is a promise the manifest must keep.
 * @returns Export rules ready for registration.
 */
export function createExportsRules(): CheckRule[] {
  return [
    {
      appliesTo: isDocumentedPackage,
      name: "exports",
      run: ({ package: workspacePackage }) => checkDocumentedImports(workspacePackage),
      summary: "Import paths shown in the README and public docs are declared in `exports`.",
    },
  ];
}
