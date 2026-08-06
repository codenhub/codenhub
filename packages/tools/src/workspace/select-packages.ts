import { glob, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import type { Workspace, WorkspacePackage } from "./discover.ts";
import { createAliasIndex, lookupPackage, suggestAliases } from "./package-aliases.ts";

const GLOB_CHARACTERS = /[*?[\]{}]/;

/** One package selected for a run, with any narrowing paths it was given. */
export interface PackageSelection {
  /** Selected package. */
  package: WorkspacePackage;
  /** Package-relative POSIX paths that narrow the run, empty when the whole package was selected. */
  paths: readonly string[];
}

/** The full set of packages and paths a command should act on. */
export interface Selection {
  /** Selected packages in workspace order. */
  targets: readonly PackageSelection[];
  /**
   * Repository-relative POSIX paths that belong to no package, such as `docs/`.
   * Only repository-wide tools can act on these.
   */
  unownedPaths: readonly string[];
  /** Whether the selection came from a fallback rather than an explicit selector. */
  isImplicit: boolean;
}

/** Inputs used to turn selector tokens into packages. */
export interface SelectPackagesOptions {
  /** Discovered workspace. */
  workspace: Workspace;
  /** Selector tokens typed by the caller. */
  tokens: readonly string[];
  /** Directory the command was invoked from. */
  cwd: string;
  /** Repository-relative changed paths, present only when change filtering is requested. */
  changedPaths?: readonly string[];
}

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

/**
 * Finds the package that owns a repository-relative path.
 *
 * The longest matching location wins so nested workspaces such as
 * `packages/icons/dev` are preferred over their parent package.
 * @param packages Discovered workspace packages.
 * @param path Repository-relative POSIX path.
 * @returns Owning package, or `undefined` when the path sits outside every package.
 */
export function findOwningPackage(packages: readonly WorkspacePackage[], path: string): WorkspacePackage | undefined {
  return packages
    .filter(({ location }) => path === location || path.startsWith(`${location}/`))
    .toSorted((first, second) => second.location.length - first.location.length)[0];
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}

/** Accumulates selected packages, the paths that narrow each one, and unowned paths. */
interface SelectionBuilder {
  add(workspacePackage: WorkspacePackage, path?: string): void;
  addUnownedPath(repositoryPath: string): void;
  has(workspacePackage: WorkspacePackage): boolean;
  isEmpty(): boolean;
  build(): PackageSelection[];
  unownedPaths(): string[];
}

function createSelectionBuilder(workspace: Workspace): SelectionBuilder {
  const entries = new Map<string, Set<string>>();
  const unowned = new Set<string>();

  return {
    add: (workspacePackage, path) => {
      const paths = entries.get(workspacePackage.name) ?? new Set<string>();
      if (path !== undefined && path !== "") {
        paths.add(path);
      }
      entries.set(workspacePackage.name, paths);
    },
    addUnownedPath: (repositoryPath) => unowned.add(repositoryPath),
    build: () =>
      workspace.packages
        .filter((workspacePackage) => entries.has(workspacePackage.name))
        .map((workspacePackage) => ({
          package: workspacePackage,
          paths: [...(entries.get(workspacePackage.name) ?? [])].sort(),
        })),
    has: (workspacePackage) => entries.has(workspacePackage.name),
    isEmpty: () => entries.size === 0 && unowned.size === 0,
    unownedPaths: () => [...unowned].sort(),
  };
}

/**
 * Records a repository-relative path against the package that owns it.
 *
 * Paths outside every package, such as `docs/`, are kept separately so
 * repository-wide tools can still act on them.
 * @param builder Selection being accumulated.
 * @param workspace Discovered workspace.
 * @param repositoryPath Repository-relative POSIX path.
 */
function addRepositoryPath(builder: SelectionBuilder, workspace: Workspace, repositoryPath: string): void {
  const owner = findOwningPackage(workspace.packages, repositoryPath);
  if (owner === undefined) {
    builder.addUnownedPath(repositoryPath);
    return;
  }
  builder.add(owner, toPosix(relative(owner.directory, resolve(workspace.root, repositoryPath))));
}

async function findExistingPath(candidates: readonly string[]): Promise<string | undefined> {
  const results = await Promise.all(
    candidates.map(async (candidate) => ((await pathExists(candidate)) ? candidate : undefined)),
  );
  return results.find((candidate) => candidate !== undefined);
}

async function resolveExistingPath(
  builder: SelectionBuilder,
  options: SelectPackagesOptions,
  token: string,
): Promise<boolean> {
  const { cwd, workspace } = options;
  const candidates = isAbsolute(token) ? [token] : [resolve(cwd, token), resolve(workspace.root, token)];
  const existing = await findExistingPath(candidates);
  if (existing === undefined) {
    return false;
  }
  addRepositoryPath(builder, workspace, toPosix(relative(workspace.root, existing)));
  return true;
}

async function resolveGlob(builder: SelectionBuilder, workspace: Workspace, token: string): Promise<boolean> {
  if (!GLOB_CHARACTERS.test(token)) {
    return false;
  }
  const matches = await Array.fromAsync(glob(token, { cwd: workspace.root }));
  for (const match of matches) {
    addRepositoryPath(builder, workspace, toPosix(match));
  }
  return matches.length > 0;
}

async function resolveWithinSelection(
  builder: SelectionBuilder,
  workspace: Workspace,
  token: string,
): Promise<boolean> {
  const owners = workspace.packages.filter((workspacePackage) => builder.has(workspacePackage));
  const owner = owners.length === 1 ? (owners[0] as WorkspacePackage) : undefined;
  if (owner === undefined) {
    return false;
  }
  const candidate = resolve(owner.directory, token);
  if (!(await pathExists(candidate))) {
    return false;
  }
  builder.add(owner, toPosix(relative(owner.directory, candidate)));
  return true;
}

function describeUnknownToken(workspace: Workspace, token: string): string {
  const suggestions = suggestAliases(createAliasIndex(workspace.packages), token);
  const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
  return `Unknown target "${token}". Expected a package name, a workspace directory, a path, or a glob.${hint}`;
}

function describeAmbiguousToken(token: string, candidates: readonly WorkspacePackage[]): string {
  const locations = candidates.map(({ location }) => location).join(", ");
  return `Ambiguous target "${token}". It matches ${candidates.length} packages: ${locations}. Use a package name or its full path.`;
}

/**
 * Turns selector tokens into the packages a command should act on.
 *
 * Each token is resolved through a fallback chain: package alias, existing path,
 * glob, then a path relative to an already selected package. Selecting nothing
 * falls back to the whole workspace. When change filtering is requested it
 * narrows an explicit selection and replaces an empty one.
 * @param options Workspace, tokens, invocation directory, and optional changed paths.
 * @returns Packages to act on, with any narrowing paths.
 * @throws When a token matches no package or more than one package.
 */
export async function selectPackages(options: SelectPackagesOptions): Promise<Selection> {
  const { changedPaths, tokens, workspace } = options;
  const aliases = createAliasIndex(workspace.packages);
  const builder = createSelectionBuilder(workspace);

  async function resolveToken(token: string): Promise<void> {
    const lookup = lookupPackage(aliases, token);
    if (lookup.kind === "ambiguous") {
      throw new Error(describeAmbiguousToken(token, lookup.candidates));
    }
    if (lookup.kind === "match") {
      builder.add(lookup.package);
      return;
    }
    if (await resolveExistingPath(builder, options, token)) {
      return;
    }
    if (await resolveGlob(builder, workspace, token)) {
      return;
    }
    if (await resolveWithinSelection(builder, workspace, token)) {
      return;
    }
    throw new Error(describeUnknownToken(workspace, token));
  }

  async function resolveFrom(index: number): Promise<void> {
    if (index >= tokens.length) {
      return;
    }
    await resolveToken(tokens[index] as string);
    await resolveFrom(index + 1);
  }

  await resolveFrom(0);

  if (changedPaths !== undefined) {
    return {
      isImplicit: builder.isEmpty(),
      targets: applyChangeFilter(workspace, builder, changedPaths),
      unownedPaths: builder.unownedPaths(),
    };
  }
  if (builder.isEmpty()) {
    return {
      isImplicit: true,
      targets: workspace.packages.map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      unownedPaths: [],
    };
  }
  return { isImplicit: false, targets: builder.build(), unownedPaths: builder.unownedPaths() };
}

function applyChangeFilter(
  workspace: Workspace,
  builder: SelectionBuilder,
  changedPaths: readonly string[],
): PackageSelection[] {
  const changed = new Set(
    changedPaths.map((path) => findOwningPackage(workspace.packages, path)?.name).filter((name) => name !== undefined),
  );
  if (builder.isEmpty()) {
    return workspace.packages
      .filter(({ name }) => changed.has(name))
      .map((workspacePackage) => ({ package: workspacePackage, paths: [] }));
  }
  return builder.build().filter(({ package: workspacePackage }) => changed.has(workspacePackage.name));
}
