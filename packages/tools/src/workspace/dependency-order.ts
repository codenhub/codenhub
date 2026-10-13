import type { WorkspacePackage } from "./discover.ts";

/**
 * Orders packages so every workspace dependency comes before its dependents.
 *
 * Only dependencies inside the given set are considered, which keeps a narrowed
 * selection buildable without pulling in the whole workspace. Cycles fall back to
 * the input order rather than failing, because a cycle is a repository problem for
 * {@link findDependencyCycles} to report, not a reason to block a run.
 * @param packages Packages to order.
 * @returns Packages in dependency-first order.
 */
export function orderByDependencies(packages: readonly WorkspacePackage[]): WorkspacePackage[] {
  const byName = new Map(packages.map((workspacePackage) => [workspacePackage.name, workspacePackage]));
  const ordered: WorkspacePackage[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(workspacePackage: WorkspacePackage): void {
    if (visited.has(workspacePackage.name) || visiting.has(workspacePackage.name)) {
      return;
    }
    visiting.add(workspacePackage.name);
    for (const dependencyName of workspacePackage.workspaceDependencies) {
      const dependency = byName.get(dependencyName);
      if (dependency !== undefined) {
        visit(dependency);
      }
    }
    visiting.delete(workspacePackage.name);
    visited.add(workspacePackage.name);
    ordered.push(workspacePackage);
  }

  for (const workspacePackage of packages) {
    visit(workspacePackage);
  }
  return ordered;
}

/**
 * Expands packages to include their transitive workspace dependencies.
 *
 * Packages nested inside a selected one are expanded too, along with what they
 * depend on. A `dev` or `debug` environment is its own workspace package under the
 * package it serves, as `docs/specs/packages-development.md` defines it, and a
 * browser test run starts those servers — so their dependencies have to be built
 * even though the package under test never imports them.
 * @param packages Packages to expand.
 * @param workspace Every known workspace package.
 * @returns Selected packages plus everything they need built, in dependency-first order.
 */
export function withWorkspaceDependencies(
  packages: readonly WorkspacePackage[],
  workspace: readonly WorkspacePackage[],
): WorkspacePackage[] {
  const byName = new Map(workspace.map((workspacePackage) => [workspacePackage.name, workspacePackage]));
  const collected = new Map<string, WorkspacePackage>();

  function collect(workspacePackage: WorkspacePackage): void {
    if (collected.has(workspacePackage.name)) {
      return;
    }
    collected.set(workspacePackage.name, workspacePackage);
    for (const dependencyName of workspacePackage.workspaceDependencies) {
      const dependency = byName.get(dependencyName);
      if (dependency !== undefined) {
        collect(dependency);
      }
    }
    for (const nested of workspace.filter((candidate) =>
      candidate.location.startsWith(`${workspacePackage.location}/`),
    )) {
      collect(nested);
    }
  }

  for (const workspacePackage of packages) {
    collect(workspacePackage);
  }
  return orderByDependencies([...collected.values()]);
}

/**
 * Finds workspace dependency cycles.
 *
 * A cycle has no valid build order, so `orderByDependencies` can only fall back
 * to the input order and build something before its dependency. Reporting is
 * separated from ordering because a run that is already underway should finish
 * and let the compliance check name the problem.
 *
 * Each cycle is returned as its members in traversal order, and a rotation of a
 * cycle already found is not repeated. Every package that takes part in a cycle
 * is a member of at least one returned cycle.
 * @param packages Packages to inspect.
 * @returns Cycles as member names in dependency order, or an empty list.
 */
export function findDependencyCycles(packages: readonly WorkspacePackage[]): string[][] {
  const byName = new Map(packages.map((workspacePackage) => [workspacePackage.name, workspacePackage]));
  const cycles = new Map<string, string[]>();
  // A depth-first walk marks a package done once and never looks through it again, so a cycle that
  // reaches a finished package is missed. Searching from each package in turn finds a cycle through it.
  for (const { name } of packages) {
    const cycle = findCycleThrough(name, byName);
    if (cycle !== undefined && !cycles.has([...cycle].sort().join(" "))) {
      cycles.set([...cycle].sort().join(" "), cycle);
    }
  }
  return [...cycles.values()];
}

/**
 * Finds one cycle that passes through a package, if any.
 * @param start Package the cycle must contain.
 * @param byName Packages by name.
 * @returns The cycle from `start` back to `start`, or `undefined` when `start` is on no cycle.
 */
function findCycleThrough(start: string, byName: ReadonlyMap<string, WorkspacePackage>): string[] | undefined {
  const parents = new Map<string, string>();
  const queue = [start];
  for (const name of queue) {
    for (const dependencyName of byName.get(name)?.workspaceDependencies ?? []) {
      if (dependencyName === start) {
        const cycle: string[] = [];
        for (let current: string | undefined = name; current !== undefined; current = parents.get(current)) {
          cycle.unshift(current);
        }
        return cycle;
      }
      if (byName.has(dependencyName) && !parents.has(dependencyName)) {
        parents.set(dependencyName, name);
        queue.push(dependencyName);
      }
    }
  }
  return undefined;
}

/**
 * Groups packages into levels that can each be processed in parallel.
 *
 * A package joins the first level that comes after every workspace dependency it
 * has inside the set, so nothing in a level depends on anything else in it.
 * Ordering alone forces a whole workspace through one package at a time even
 * though most packages depend on nothing, which is the cost this removes while
 * keeping the guarantee the ordering exists for.
 *
 * Packages left unplaceable by a cycle are appended as a final level, matching
 * how {@link orderByDependencies} falls back rather than failing.
 * @param packages Packages to group.
 * @returns Levels in dependency-first order, each safe to run concurrently.
 */
export function groupByDependencyLevel(packages: readonly WorkspacePackage[]): WorkspacePackage[][] {
  const selected = new Set(packages.map(({ name }) => name));
  const placed = new Set<string>();
  const levels: WorkspacePackage[][] = [];
  let remaining = orderByDependencies(packages);

  while (remaining.length > 0) {
    const ready = remaining.filter((workspacePackage) =>
      workspacePackage.workspaceDependencies.every((dependency) => !selected.has(dependency) || placed.has(dependency)),
    );
    if (ready.length === 0) {
      // A cycle leaves every survivor waiting on another survivor.
      levels.push(remaining);
      break;
    }
    for (const { name } of ready) {
      placed.add(name);
    }
    levels.push(ready);
    remaining = remaining.filter(({ name }) => !placed.has(name));
  }
  return levels;
}
