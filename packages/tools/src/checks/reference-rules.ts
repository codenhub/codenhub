import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseReferenceConfig } from "../documentation/reference-config.ts";
import { hasContentDrift } from "../generators/generator.ts";
import { analyzeReference } from "../generators/reference-generator.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { CheckRule, Finding } from "./rule.ts";

const REFERENCE_DIR = "docs/reference";
const MANIFEST = "package.json";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasReferenceConfig(workspacePackage: WorkspacePackage): boolean {
  try {
    return parseReferenceConfig(workspacePackage.manifest, `${workspacePackage.location}/${MANIFEST}`) !== null;
  } catch {
    // A malformed config still opts the package in; `run` reports the problem.
    return true;
  }
}

async function listMarkdown(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        return listMarkdown(root, relative);
      }
      return entry.name.endsWith(".md") ? [relative] : [];
    }),
  );
  return nested.flat();
}

async function run(workspacePackage: WorkspacePackage): Promise<Finding[]> {
  let config;
  try {
    config = parseReferenceConfig(workspacePackage.manifest, `${workspacePackage.location}/${MANIFEST}`);
  } catch (error) {
    return [{ code: "reference/entrypoint", location: MANIFEST, message: errorMessage(error), severity: "error" }];
  }
  if (config === null) {
    return [];
  }

  let analysis;
  try {
    analysis = await analyzeReference(workspacePackage, config);
  } catch (error) {
    return [{ code: "reference/entrypoint", location: REFERENCE_DIR, message: errorMessage(error), severity: "error" }];
  }

  const findings: Finding[] = [];
  const onDisk = (await listMarkdown(join(workspacePackage.directory, REFERENCE_DIR))).map(
    (relative) => `${REFERENCE_DIR}/${relative}`,
  );
  const expected = new Map(
    analysis.files.map((file) => [file.path.slice(workspacePackage.location.length + 1), file.contents]),
  );

  if (onDisk.length === 0) {
    findings.push({
      code: "reference/missing",
      location: REFERENCE_DIR,
      message: "Opted into codenhub.docs.reference, but docs/reference/ is absent. Run `pnpm generate`.",
      severity: "error",
    });
  } else {
    const drift = await Promise.all(
      [...expected].map(async ([relative, contents]): Promise<Finding | undefined> => {
        const authored = await readFile(join(workspacePackage.directory, relative), "utf8").catch(() => undefined);
        return authored === undefined || hasContentDrift(contents, authored)
          ? {
              code: "reference/drift",
              location: relative,
              message: "Generated reference page is out of date. Run `pnpm generate`.",
              severity: "error",
            }
          : undefined;
      }),
    );
    findings.push(...drift.filter((finding): finding is Finding => finding !== undefined));

    for (const relative of onDisk) {
      if (!expected.has(relative)) {
        findings.push({
          code: "reference/unexpected-file",
          location: relative,
          message: "Not produced by the reference generator; delete it or fix the entrypoint that should produce it.",
          severity: "error",
        });
      }
    }
  }

  for (const unsupported of analysis.model.unsupported) {
    findings.push({
      code: "reference/unsupported-export",
      location: `${MANIFEST} (${unsupported.subpath})`,
      message: `Export "${unsupported.name}" has a declaration kind the reference page model does not cover.`,
      severity: "error",
    });
  }

  if (config.prose) {
    for (const entrypoint of analysis.model.entrypoints) {
      for (const symbol of entrypoint.symbols) {
        if (symbol.doc === undefined) {
          findings.push({
            code: "reference/undocumented-symbol",
            location: `${REFERENCE_DIR} (${entrypoint.subpath})`,
            message: `"${symbol.name}" has no TSDoc; its reference entry will show only a signature.`,
            severity: "warning",
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Builds the rule that enforces `docs/specs/packages-reference.md`.
 *
 * It applies to a package whose `codenhub.docs.reference` is an object, and
 * regenerates that package's reference to compare it against what is committed:
 * a missing area, a stale or unexpected page, an unresolved or colliding
 * entrypoint, an unsupported export kind, and (for `prose`) an undocumented
 * public symbol.
 * @returns The `reference` rule, ready for registration.
 */
export function createReferenceRules(): CheckRule[] {
  return [
    {
      appliesTo: hasReferenceConfig,
      name: "reference",
      run: ({ package: workspacePackage }) => run(workspacePackage),
      summary: "Generated docs/reference/ is present, current, and complete for opted-in packages.",
    },
  ];
}
