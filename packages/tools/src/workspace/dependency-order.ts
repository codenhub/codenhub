import type { WorkspacePackage } from "./discover.ts";

/**
 * Orders packages so every workspace dependency comes before its dependents.
 *
 * Only dependencies inside the given set are considered, which keeps a narrowed
 * selection buildable without pulling in the whole workspace. Cycles fall back to
 * the input order rather than failing, because a cycle is a repository problem to
 * report elsewhere, not a reason to block a run.
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
 * @param packages Packages to expand.
 * @param workspace Every known workspace package.
 * @returns Selected packages plus their workspace dependencies, in dependency-first order.
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
  }

  for (const workspacePackage of packages) {
    collect(workspacePackage);
  }
  return orderByDependencies([...collected.values()]);
}
