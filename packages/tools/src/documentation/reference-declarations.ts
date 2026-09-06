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
    return entry;
  }
  if (entry !== null && typeof entry === "object") {
    const conditions = entry as Record<string, unknown>;
    const candidate = conditions.types ?? conditions.import ?? conditions.default;
    return typeof candidate === "string" ? candidate : undefined;
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
 * @returns One plan per documented entrypoint, in `exports` order (or `config.entrypoints` order).
 * @throws When a configured subpath is absent from `exports` or resolves to no file target.
 */
export function resolveEntrypoints(exportsMap: unknown, config: ReferenceConfig): EntrypointPlan[] {
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
        sourceRel: `${stem}.${extension}`,
        subpath,
      },
    ];
  });
}

/**
 * Emits entrypoint declarations in memory, retaining documentation comments.
 * @param pkgDir Absolute package directory, using POSIX separators.
 * @param plans Entrypoints to emit from the package's src directory.
 * @returns Declaration contents keyed relative to src; nothing is written to disk.
 */
export function emitDeclarations(pkgDir: string, plans: readonly EntrypointPlan[]): Map<string, string> {
  const configFile = ts.readConfigFile(`${pkgDir}/tsconfig.json`, ts.sys.readFile);
  if (configFile.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, pkgDir);
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
    rootNames: plans.map((plan) => {
      const source = `${pkgDir}/src/${plan.sourceRel}`;
      const tsx = source.replace(/\.ts$/, ".tsx");
      return !ts.sys.fileExists(source) && ts.sys.fileExists(tsx) ? tsx : source;
    }),
  });

  const sourceRoot = `${pkgDir}/src/`;
  const declarations = new Map<string, string>();
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
  return declarations;
}
