import { glob, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const WORKSPACE_MANIFEST = "pnpm-workspace.yaml";
const PACKAGES_KEY = /^packages:\s*$/;
const LIST_ITEM = /^\s+-\s*(?<entry>.+?)\s*$/;
const TOP_LEVEL_KEY = /^\S/;
const WORKSPACE_PROTOCOL = "workspace:";
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

/** A package or app discovered through the pnpm workspace definition. */
export interface WorkspacePackage {
  /** Manifest name, such as `@codenhub/error`. */
  name: string;
  /** Manifest name without its npm scope, such as `error`. */
  unscopedName: string;
  /** Directory name, such as `error` for `packages/error`. */
  directoryName: string;
  /** Absolute package directory. */
  directory: string;
  /** Repository-relative POSIX directory, such as `packages/error`. */
  location: string;
  /** Whether the package is excluded from publishing. */
  isPrivate: boolean;
  /** Script names mapped to their commands. */
  scripts: Readonly<Record<string, string>>;
  /** Names of workspace packages this package depends on. */
  workspaceDependencies: readonly string[];
  /**
   * The parsed manifest.
   *
   * Compliance checks read fields the rest of the tooling has no use for, so the
   * whole document is kept rather than growing this interface for each of them.
   */
  manifest: Readonly<Record<string, unknown>>;
}

/** Every package reachable from the workspace root. */
export interface Workspace {
  /** Absolute repository root. */
  root: string;
  /** Discovered packages, ordered by `location`. */
  packages: readonly WorkspacePackage[];
}

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

function unquote(value: string): string {
  const isQuoted =
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
  return isQuoted ? value.slice(1, -1) : value;
}

/**
 * Reads the `packages` globs from a pnpm workspace manifest.
 *
 * Only the flat sequence of glob strings is understood, which is all pnpm
 * accepts for this key, so no YAML dependency is needed.
 * @param manifest Raw `pnpm-workspace.yaml` contents.
 * @returns Declared workspace globs in manifest order.
 * @throws When the manifest declares no usable `packages` globs.
 */
export function parseWorkspacePatterns(manifest: string): string[] {
  const lines = manifest.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => PACKAGES_KEY.test(line));
  if (startIndex === -1) {
    throw new Error(`Invalid ${WORKSPACE_MANIFEST}: missing a "packages:" key.`);
  }

  const patterns: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }
    if (TOP_LEVEL_KEY.test(line)) {
      break;
    }
    const entry = LIST_ITEM.exec(line)?.groups?.entry;
    if (entry === undefined) {
      break;
    }
    patterns.push(unquote(entry));
  }

  if (patterns.length === 0) {
    throw new Error(`Invalid ${WORKSPACE_MANIFEST}: "packages:" declares no globs.`);
  }
  return patterns;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === "string")) as Record<
    string,
    string
  >;
}

function readWorkspaceDependencies(manifest: Record<string, unknown>): string[] {
  const names = DEPENDENCY_FIELDS.flatMap((field) =>
    Object.entries(readStringMap(manifest[field]))
      .filter(([, range]) => range.startsWith(WORKSPACE_PROTOCOL))
      .map(([name]) => name),
  );
  return [...new Set(names)].sort();
}

async function readPackage(root: string, manifestPath: string): Promise<WorkspacePackage> {
  const absolutePath = resolve(root, manifestPath);
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (cause) {
    throw new Error(`Invalid package manifest at ${toPosix(manifestPath)}: ${(cause as Error).message}`);
  }
  if (!isRecord(manifest) || typeof manifest.name !== "string") {
    throw new Error(`Invalid package manifest at ${toPosix(manifestPath)}: missing a "name" string.`);
  }

  const directory = dirname(absolutePath);
  const location = toPosix(relative(root, directory));
  return {
    directory,
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: manifest.private === true,
    location,
    manifest,
    name: manifest.name,
    scripts: readStringMap(manifest.scripts),
    unscopedName: manifest.name.slice(manifest.name.lastIndexOf("/") + 1),
    workspaceDependencies: readWorkspaceDependencies(manifest),
  };
}

/**
 * Discovers every workspace package declared by `pnpm-workspace.yaml`.
 * @param root Absolute repository root.
 * @returns Workspace packages ordered by location.
 * @throws When the manifest is unreadable or a package manifest is malformed.
 */
export async function discoverWorkspace(root: string): Promise<Workspace> {
  const patterns = parseWorkspacePatterns(await readFile(resolve(root, WORKSPACE_MANIFEST), "utf8"));
  const matches = await Promise.all(
    patterns.map(async (pattern) => Array.fromAsync(glob(`${pattern}/package.json`, { cwd: root }))),
  );
  const manifestPaths = [...new Set(matches.flat().map(toPosix))].sort();
  const packages = await Promise.all(manifestPaths.map(async (path) => readPackage(root, path)));

  return { packages: packages.toSorted((first, second) => first.location.localeCompare(second.location)), root };
}
