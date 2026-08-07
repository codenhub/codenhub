import { readdir, readFile, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join, posix } from "node:path";

import type { WorkspacePackage } from "../workspace/discover.ts";

/** Directories that hold no authored source. */
const SKIPPED_DIRECTORIES = new Set([".astro", ".git", "coverage", "dist", "node_modules", "test-results"]);

/**
 * Directory of shared real-usage scenarios.
 *
 * `docs/specs/packages-development.md` calls this leaf code rather than a
 * workspace package: it sits inside one package but is run by that package's
 * `dev` and `debug` workspaces, which is where its imports must be declared.
 * It is therefore read as part of those workspaces and not of its host.
 */
export const SCENARIO_DIRECTORY = "playground";

/** Extensions whose imports are read. */
const CODE_EXTENSIONS = new Set([
  ".astro",
  ".cjs",
  ".css",
  ".cts",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".svelte",
  ".ts",
  ".tsx",
]);

/** Extensions whose text is searched for a mention of a declared dependency. */
const TEXT_EXTENSIONS = new Set([...CODE_EXTENSIONS, ".json", ".md", ".txt", ".yaml", ".yml"]);

/** Extensions tried when a published target or a relative import is mapped back to source. */
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx", ".css"];

const TEST_FILE = /\.(?:test|spec|bench)\.[^/]+$|\/__tests__\//;
const BUILD_DIRECTORY = "dist/";
const SOURCE_DIRECTORY = "src/";
// npm's own name rule, narrowed to the lowercase names a registry accepts today.
const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const BUILT_IN_MODULES = new Set(builtinModules);

const SPECIFIER_PATTERNS: readonly RegExp[] = [
  /(?:^|[\s;}])import\s+[^;'"]*?from\s*["']([^"']+)["']/gm,
  /(?:^|[\s;}])import\s*["']([^"']+)["']/gm,
  /(?:^|[\s;}])export\s+[^;'"]*?from\s*["']([^"']+)["']/gm,
  /\bimport\s*\(\s*["']([^"']+)["']/gm,
  /\brequire\s*\(\s*["']([^"']+)["']/gm,
  /@import\s+(?:url\()?\s*["']([^"']+)["']/gm,
];

/** What a package's own files say about the packages it uses. */
export interface DependencyUsage {
  /** External packages imported by code reachable from the published entry points. */
  shipped: ReadonlySet<string>;
  /** External packages imported by any non-test source file. */
  authored: ReadonlySet<string>;
  /** Concatenated package text, searched for a mention of a declared dependency. */
  text: string;
}

function extensionOf(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

// A statement that imports or exports only types. TypeScript erases it, so it
// contributes nothing to what the built file loads at run time.
const TYPE_ONLY_STATEMENT = /^[^\S\n]*(?:import|export)\s+type\s[^\n]*?["'][^"'\n]+["'][^\n]*$/gm;

/**
 * Removes the statements a TypeScript build erases.
 *
 * A type-only import leaves nothing behind in the emitted JavaScript, so a
 * package it names is not something a consumer has to install to run the code.
 * @param source File contents.
 * @returns The source with type-only import and export statements blanked out.
 */
export function stripTypeOnlyStatements(source: string): string {
  return source.replaceAll(TYPE_ONLY_STATEMENT, "");
}

/**
 * Reads every module specifier a source file names.
 *
 * Specifiers are matched textually rather than parsed, which is why a file that
 * only quotes a specifier — a documentation fixture, say — reads as importing it.
 * Callers that cannot tolerate that read authored files only, where the cost of a
 * stray match is bounded.
 * @param source File contents.
 * @returns Every specifier found, in no particular order.
 */
export function readSpecifiers(source: string): string[] {
  const found = new Set<string>();
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match !== null) {
      found.add(match[1] as string);
      match = pattern.exec(source);
    }
  }
  return [...found];
}

/**
 * Reduces a module specifier to the package that would satisfy it.
 * @param specifier Specifier as written in the source.
 * @returns Package name, or `undefined` for relative, absolute, built-in, and unusable specifiers.
 */
export function toPackageName(specifier: string): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) {
    return undefined;
  }
  const segments = specifier.split("/");
  const name = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] as string);
  return PACKAGE_NAME.test(name) && !BUILT_IN_MODULES.has(name) ? name : undefined;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function findFirstFile(root: string, candidates: readonly string[]): Promise<string | undefined> {
  const exists = await Promise.all(candidates.map(async (candidate) => isFile(join(root, candidate))));
  return candidates.find((_, index) => exists[index] === true);
}

function collectTargets(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    found.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectTargets(item, found);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      collectTargets(item, found);
    }
  }
  return found;
}

/**
 * Maps a published target back to the source file it is built from.
 *
 * `exports` names build output, so the mapping rewrites the build directory to
 * the source one and tries the source extensions. A target that resolves to
 * nothing is dropped rather than guessed at.
 * @param root Absolute package directory.
 * @param target Target as written in the manifest, such as `./dist/lib/react.js`.
 * @returns Package-relative source path, or `undefined` when nothing matches.
 */
async function resolveEntry(root: string, target: string): Promise<string | undefined> {
  const cleaned = target.replace(/^\.\//, "").replaceAll("\\", "/");
  const inSource = cleaned.startsWith(BUILD_DIRECTORY)
    ? `${SOURCE_DIRECTORY}${cleaned.slice(BUILD_DIRECTORY.length)}`
    : cleaned;
  if (inSource.endsWith(".css")) {
    return (await isFile(join(root, inSource))) ? inSource : undefined;
  }
  const base = inSource.replace(/\.d\.[cm]?ts$|\.[cm]?jsx?$/, "");
  return findFirstFile(
    root,
    SOURCE_EXTENSIONS.flatMap((extension) => [`${base}${extension}`, `${base}/index${extension}`]),
  );
}

async function resolveRelative(root: string, fromPath: string, specifier: string): Promise<string | undefined> {
  const base = posix.join(posix.dirname(fromPath), specifier);
  return findFirstFile(root, [
    base,
    ...SOURCE_EXTENSIONS.flatMap((extension) => [`${base}${extension}`, `${base}/index${extension}`]),
  ]);
}

async function walkFrom(root: string, path: string, seen: Set<string>, imports: Set<string>): Promise<void> {
  if (seen.has(path)) {
    return;
  }
  seen.add(path);
  // Type-only statements are dropped before the graph is walked, in both
  // directions: the package they name does not ship, and neither does a local
  // file that nothing but a type-only import reaches.
  const source = stripTypeOnlyStatements(await readFile(join(root, path), "utf8").catch(() => ""));
  const relativeSpecifiers: string[] = [];
  for (const specifier of readSpecifiers(source)) {
    if (specifier.startsWith(".")) {
      relativeSpecifiers.push(specifier);
      continue;
    }
    const name = toPackageName(specifier);
    if (name !== undefined) {
      imports.add(name);
    }
  }
  const resolved = await Promise.all(
    relativeSpecifiers.map(async (specifier) => resolveRelative(root, path, specifier)),
  );
  await Promise.all(resolved.flatMap((next) => (next === undefined ? [] : [walkFrom(root, next, seen, imports)])));
}

/**
 * Lists a package's own files.
 *
 * A subdirectory with its own manifest belongs to another workspace package and
 * is skipped, so a package is never credited with what its playground imports.
 * @param root Absolute package directory.
 * @param relativePath Directory being listed, relative to `root`.
 * @returns Package-relative POSIX paths, excluding the manifest itself.
 */
async function listOwnFiles(root: string, relativePath = ""): Promise<string[]> {
  const entries = await readdir(join(root, relativePath), { withFileTypes: true }).catch(() => []);
  if (relativePath !== "" && entries.some((entry) => entry.isFile() && entry.name === "package.json")) {
    return [];
  }
  const found = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (entry.isSymbolicLink() || SKIPPED_DIRECTORIES.has(entry.name) || entry.name === SCENARIO_DIRECTORY) {
        return [];
      }
      const entryPath = relativePath === "" ? entry.name : `${relativePath}/${entry.name}`;
      if (entry.isDirectory()) {
        return listOwnFiles(root, entryPath);
      }
      return entry.isFile() && entry.name !== "package.json" ? [entryPath] : [];
    }),
  );
  return found.flat();
}

/**
 * Reads which packages a package's own files use.
 *
 * Two scopes are collected because they answer different questions. `shipped`
 * walks the import graph from the published entry points, which is the only way
 * to tell code that reaches a consumer from a test helper that happens to live
 * beside it, and it excludes type-only imports because a build erases them.
 * `authored` covers every non-test source file and keeps type-only imports,
 * because a package has to be installed to type-check against it whether or not
 * it survives the build. Test files are left out of `authored`: they routinely
 * quote example imports, and a test that imports something missing fails the
 * moment it runs.
 * @param workspacePackage Package to read.
 * @param scenarioDirectories Absolute scenario directories this package runs, such as a parent package's playground.
 * @returns Imported package names by scope, and the text a mention could appear in.
 */
export async function readDependencyUsage(
  workspacePackage: WorkspacePackage,
  scenarioDirectories: readonly string[] = [],
): Promise<DependencyUsage> {
  const root = workspacePackage.directory;
  const manifest = workspacePackage.manifest;
  const owned = (await listOwnFiles(root)).map((file) => ({ file, root }));
  const scenarios = await Promise.all(
    scenarioDirectories.map(async (directory) =>
      (await listOwnFiles(directory)).map((file) => ({ file, root: directory })),
    ),
  );
  const files = [...owned, ...scenarios.flat()];
  const sources = await Promise.all(
    files.map(async ({ file, root: fileRoot }) =>
      TEXT_EXTENSIONS.has(extensionOf(file)) ? readFile(join(fileRoot, file), "utf8").catch(() => "") : "",
    ),
  );

  const targets = [
    ...collectTargets(manifest.exports),
    ...collectTargets(manifest.main),
    ...collectTargets(manifest.module),
    ...collectTargets(manifest.bin),
  ];
  const entries = await Promise.all([...new Set(targets)].map(async (target) => resolveEntry(root, target)));
  const resolvedEntries = [...new Set(entries.filter((entry) => entry !== undefined))];

  const shipped = new Set<string>();
  const seen = new Set<string>();
  await Promise.all(resolvedEntries.map(async (entry) => walkFrom(root, entry, seen, shipped)));
  shipped.delete(workspacePackage.name);

  const authored = new Set<string>();
  for (const [index, { file }] of files.entries()) {
    if (!CODE_EXTENSIONS.has(extensionOf(file)) || TEST_FILE.test(file)) {
      continue;
    }
    for (const specifier of readSpecifiers(sources[index] as string)) {
      const name = toPackageName(specifier);
      if (name !== undefined && name !== workspacePackage.name) {
        authored.add(name);
      }
    }
  }

  return {
    authored,
    shipped,
    text: [JSON.stringify(manifest.scripts ?? {}), ...sources].join("\n"),
  };
}

/**
 * Reads the executable names a dependency installs.
 *
 * A build tool is used through its binary rather than through an import, so its
 * `bin` names are what a package script would mention. They are read from the
 * installed copy because only the dependency itself knows them.
 * @param workspacePackage Package whose dependency tree is read.
 * @param dependencyName Dependency to look up.
 * @returns Declared binary names, or an empty list when the dependency is absent or installs none.
 */
export async function readBinaryNames(workspacePackage: WorkspacePackage, dependencyName: string): Promise<string[]> {
  const manifestPath = join(workspacePackage.directory, "node_modules", dependencyName, "package.json");
  const source = await readFile(manifestPath, "utf8").catch(() => undefined);
  if (source === undefined) {
    return [];
  }
  const bin = (JSON.parse(source) as { bin?: unknown }).bin;
  if (typeof bin === "string") {
    return [dependencyName.slice(dependencyName.lastIndexOf("/") + 1)];
  }
  return typeof bin === "object" && bin !== null ? Object.keys(bin) : [];
}
