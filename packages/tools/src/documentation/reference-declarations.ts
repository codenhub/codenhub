import { glob } from "node:fs/promises";
import { dirname, posix } from "node:path";

import ts from "typescript";

import type { ReferenceConfig } from "./reference-config.ts";

const ENTRY_EXTENSION = /\.(?:d\.[cm]?ts|[cm]?js|[cm]?ts)$/;

/** One documented entrypoint, resolved from an `exports` subpath to its source and module. */
export interface EntrypointPlan {
  /** `exports` subpath key, such as `"."` or `"./registries/browser"`. */
  subpath: string;
  /** Source entry file, relative to the package `src/` directory: `index.ts`, `registries/browser.ts`. */
  sourceRel: string;
  /** TypeDoc module name for that entry: `index`, `registries`, `registries/browser`. */
  module: string;
  /** Emitted declaration file for that entry, relative to `src/`: `index.d.ts`, `registries/index.d.ts`. */
  entryDts: string;
}

function subpathTarget(entry: unknown): string | undefined {
  if (typeof entry === "string") {
    return /\.(?:d\.[cm]?ts|[cm]?ts)$/.test(entry) ? entry : undefined;
  }
  if (entry !== null && typeof entry === "object") {
    const conditions = entry as Record<string, unknown>;
    return (
      subpathTarget(conditions.types) ??
      Object.values(conditions)
        .map(subpathTarget)
        .find((target) => target !== undefined)
    );
  }
  return undefined;
}

/** `./dist/registries/browser.d.ts` → `registries/browser`. */
function entryStem(target: string): string {
  return target
    .replace(/^\.\//, "")
    .replace(/^dist\//, "")
    .replace(ENTRY_EXTENSION, "");
}

/**
 * Resolves the entrypoints to document from a package's `exports` and its config.
 * @param exportsMap The manifest `exports` object.
 * @param config Parsed `codenhub.docs.reference`.
 * @param pkgDir Package directory, when available, to resolve the actual source extension.
 * @returns One plan per documented entrypoint, in `exports` order (or `config.entrypoints` order).
 * @throws When a configured subpath is absent from `exports` or resolves to no file target.
 */
export function resolveEntrypoints(exportsMap: unknown, config: ReferenceConfig, pkgDir?: string): EntrypointPlan[] {
  const map = exportsMap !== null && typeof exportsMap === "object" ? (exportsMap as Record<string, unknown>) : {};
  const explicit = config.entrypoints !== undefined;
  const subpaths = config.entrypoints ?? Object.keys(map).filter((key) => key === "." || key.startsWith("./"));

  return subpaths.flatMap((subpath) => {
    if (!(subpath in map)) {
      throw new Error(`codenhub.docs.reference entrypoint "${subpath}" is not in package exports.`);
    }
    const target = subpathTarget(map[subpath]);
    if (target === undefined || !ENTRY_EXTENSION.test(target)) {
      if (explicit) {
        throw new Error(`codenhub.docs.reference entrypoint "${subpath}" does not resolve to a TypeScript module.`);
      }
      return [];
    }
    const stem = entryStem(target);
    const module = stem === "index" ? "index" : stem.replace(/\/index$/, "");
    const extension = /\.(?:d\.mts|mts|mjs)$/.test(target)
      ? "mts"
      : /\.(?:d\.cts|cts|cjs)$/.test(target)
        ? "cts"
        : "ts";
    return [
      {
        entryDts: `${stem}.d.${extension}`,
        module,
        sourceRel: pkgDir === undefined ? `${stem}.${extension}` : resolveSourceRel(pkgDir, `${stem}.${extension}`),
        subpath,
      },
    ];
  });
}

function resolveSourceRel(pkgDir: string, sourceRel: string): string {
  const tsx = sourceRel.replace(/\.ts$/, ".tsx");
  return !ts.sys.fileExists(`${pkgDir}/src/${sourceRel}`) && ts.sys.fileExists(`${pkgDir}/src/${tsx}`)
    ? tsx
    : sourceRel;
}

/**
 * Lists package files matching an export pattern, whose `*` may span directories as in Node's resolution.
 * @param pkgDir Package directory to search.
 * @param pattern Package-relative pattern with one `*`.
 * @returns Matching package-relative paths, using POSIX separators.
 */
async function matchExportPattern(pkgDir: string, pattern: string): Promise<string[]> {
  const star = pattern.indexOf("*");
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  const files = await Array.fromAsync(glob(`${prefix.slice(0, prefix.lastIndexOf("/") + 1)}**/*`, { cwd: pkgDir }));
  return files
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => path.length > prefix.length + suffix.length && path.startsWith(prefix) && path.endsWith(suffix));
}

/**
 * Expands a typed export pattern from built declarations and matching source entry files.
 * @param pkgDir Package directory to search.
 * @param plan The unresolved export pattern.
 * @param target Its type target from the manifest.
 * @returns Concrete plans and their declaration targets, or the original plan when nothing matches.
 */
export async function expandEntrypoint(pkgDir: string, plan: EntrypointPlan, target: string) {
  if (!target.includes("*")) {
    return [{ ...plan, target: posix.normalize(target) }];
  }
  const pattern = posix.normalize(target);
  const [disk, sources, tsxSources] = await Promise.all([
    matchExportPattern(pkgDir, pattern),
    matchExportPattern(pkgDir, `src/${plan.sourceRel}`),
    plan.sourceRel.endsWith(".ts") ? matchExportPattern(pkgDir, `src/${plan.sourceRel}x`) : [],
  ]);
  const matches = new Set([
    ...disk,
    ...[...sources, ...tsxSources].map((path) => `dist/${path.slice(4).replace(/\.([cm]?ts)x?$/, ".d.$1")}`),
  ]);
  const star = pattern.indexOf("*");
  return matches.size === 0
    ? [{ ...plan, target: pattern }]
    : [...matches].sort().map((match) => {
        const replacement = match.slice(star, match.length - (pattern.length - star - 1));
        return {
          entryDts: plan.entryDts.replaceAll("*", replacement),
          module: plan.module.replaceAll("*", replacement),
          sourceRel: resolveSourceRel(pkgDir, plan.sourceRel.replaceAll("*", replacement)),
          subpath: plan.subpath.replaceAll("*", replacement),
          target: match,
        };
      });
}

function readTsconfigs(pkgDir: string): ts.ParsedCommandLine[] {
  const configs: ts.ParsedCommandLine[] = [];
  const visited = new Set<string>();
  const read = (path: string): void => {
    if (visited.has(path)) {
      return;
    }
    visited.add(path);
    const configFile = ts.readConfigFile(path, ts.sys.readFile);
    if (configFile.error !== undefined) {
      throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
    }
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(path), undefined, path);
    for (const reference of parsed.projectReferences ?? []) {
      read(ts.resolveProjectReferencePath(reference));
    }
    configs.push(parsed);
  };
  read(`${pkgDir}/tsconfig.json`);
  return configs;
}

function entrypointProjects(pkgDir: string, plans: readonly EntrypointPlan[]) {
  const configs = readTsconfigs(pkgDir);
  return Map.groupBy(plans, (plan) => {
    const source = `${pkgDir}/src/${resolveSourceRel(pkgDir, plan.sourceRel)}`;
    // The most specific owner: the fewest files, then the earliest reference.
    return (
      configs
        .filter((config) => config.fileNames.some((file) => file.replaceAll("\\", "/") === source))
        .reduce<ts.ParsedCommandLine | undefined>(
          (best, config) => (best === undefined || config.fileNames.length < best.fileNames.length ? config : best),
          undefined,
        ) ?? configs.at(-1)!
    );
  });
}

/**
 * Reads the hand-written declaration files the package's tsconfig includes from `src/`.
 * @param pkgDir Absolute package directory, using POSIX separators.
 * @param plans Entrypoints whose owning projects supply the ambient files.
 * @returns Their contents keyed by package-relative path, such as `src/env.d.ts`.
 */
export function readAmbientDeclarations(pkgDir: string, plans: readonly EntrypointPlan[]): Map<string, string> {
  const ambient = new Map<string, string>();
  for (const fileName of [...entrypointProjects(pkgDir, plans).keys()].flatMap((config) => config.fileNames)) {
    const posixName = fileName.split("\\").join("/");
    if (posixName.startsWith(`${pkgDir}/src/`) && /\.d\.[cm]?ts$/.test(posixName)) {
      ambient.set(posixName.slice(pkgDir.length + 1), ts.sys.readFile(fileName) ?? "");
    }
  }
  return ambient;
}

/**
 * Emits entrypoint declarations in memory, retaining documentation comments.
 * @param pkgDir Absolute package directory, using POSIX separators.
 * @param plans Entrypoints to emit from the package's src directory.
 * @returns Declaration contents keyed relative to src; nothing is written to disk.
 */
export function emitDeclarations(pkgDir: string, plans: readonly EntrypointPlan[]): Map<string, string> {
  const byProject = entrypointProjects(pkgDir, plans);
  const sourceRoot = `${pkgDir}/src/`;
  const declarations = new Map<string, string>();
  for (const [parsed, entries] of byProject) {
    const program = ts.createProgram({
      options: {
        ...parsed.options,
        composite: false,
        declaration: true,
        declarationDir: undefined,
        emitDeclarationOnly: true,
        incremental: false,
        noEmit: false,
        noEmitOnError: false,
        removeComments: false,
        outDir: undefined,
        rootDir: `${pkgDir}/src`,
        skipLibCheck: true,
        tsBuildInfoFile: undefined,
      },
      rootNames: [
        ...new Set([
          ...parsed.fileNames,
          ...entries.map((plan) => `${pkgDir}/src/${resolveSourceRel(pkgDir, plan.sourceRel)}`),
        ]),
      ],
      projectReferences: parsed.projectReferences,
    });

    program.emit(
      undefined,
      (fileName, text) => {
        const posixName = fileName.split("\\").join("/");
        if (posixName.startsWith(sourceRoot)) {
          declarations.set(posixName.slice(sourceRoot.length), text);
        }
      },
      undefined,
      true,
    );
  }
  return declarations;
}
