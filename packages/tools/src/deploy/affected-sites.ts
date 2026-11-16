import type { Workspace, WorkspacePackage } from "../workspace/discover.ts";
import { findOwningPackage } from "../workspace/select-packages.ts";

/** An app deployed to Cloudflare, and what its build reads beyond its dependency graph. */
export interface DeployedSite {
  /** Workspace location of the app, such as `apps/www`. */
  location: string;
  /**
   * Repository paths outside the app's dependency graph that its build also reads from the
   * working tree, such as the manifests of packages it does not depend on.
   */
  alsoReads?: RegExp;
}

const EVERY_PACKAGE_MANIFEST = /^packages\/.+\/package\.json$/;
const EVERY_DEMO_MANIFEST = /^packages\/[^/]+\/demo\/package\.json$/;

/**
 * The deployed apps, in the order `hub deploy:affected` prints them. The main and documentation
 * sites read every working-tree manifest, for `listed: false`, `codenhub.docs.versions`, and
 * whether a package has a demo; the demo site discovers its demos by their manifests
 * (`docs/ci.md`, "Deployments").
 */
export const DEPLOYED_SITES: readonly DeployedSite[] = [
  { alsoReads: EVERY_PACKAGE_MANIFEST, location: "apps/www" },
  { alsoReads: EVERY_PACKAGE_MANIFEST, location: "apps/docs" },
  { alsoReads: EVERY_DEMO_MANIFEST, location: "apps/demo" },
];

/**
 * Root files every site build reads: the toolchain, the install, and the base TypeScript config.
 * Lint and format configuration is absent because no build reads it.
 */
const SITE_WIDE_PATHS = new Set([
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "package.json",
  "tsconfig.json",
  ".nvmrc",
  ".npmrc",
]);

/**
 * Files at a package's root that no site build reads from the working tree: package prose,
 * which production builds read from the release-tag snapshot, and test configuration.
 */
const NON_BUILD_ROOT_FILES = new Set([
  "AGENTS.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "llms-full.txt",
  "llms.txt",
  "playwright.config.ts",
  "tsconfig.test.json",
  "vitest.config.ts",
]);

/** Directories at a package's root that no site build reads from the working tree. */
const NON_BUILD_ROOT_DIRECTORIES = ["bench/", "docs/", "playground/", "tests/"];

const README_TRANSLATION = /^README\.[^/]+\.md$/;

function isNonBuildFile(packagePath: string): boolean {
  return (
    NON_BUILD_ROOT_FILES.has(packagePath) ||
    README_TRANSLATION.test(packagePath) ||
    NON_BUILD_ROOT_DIRECTORIES.some((directory) => packagePath.startsWith(directory)) ||
    packagePath.endsWith(".test.ts")
  );
}

/**
 * Names a package and every workspace package it depends on, directly or transitively.
 *
 * Unlike `withWorkspaceDependencies`, a package nested inside a dependency is not
 * included: `packages/styles/demo` is a package of its own, and a site that depends on
 * `@codenhub/styles` does not build it.
 */
function dependencyClosure(app: WorkspacePackage, workspace: Workspace): Set<string> {
  const byName = new Map(workspace.packages.map((workspacePackage) => [workspacePackage.name, workspacePackage]));
  const names = new Set<string>();
  const pending = [app];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (names.has(next.name)) {
      continue;
    }
    names.add(next.name);
    for (const dependencyName of next.workspaceDependencies) {
      const dependency = byName.get(dependencyName);
      if (dependency !== undefined) {
        pending.push(dependency);
      }
    }
  }
  return names;
}

function affects(site: DeployedSite, inputs: ReadonlySet<string>, workspace: Workspace, path: string): boolean {
  if (SITE_WIDE_PATHS.has(path) || site.alsoReads?.test(path) === true) {
    return true;
  }
  const owner = findOwningPackage(workspace.packages, path);
  return owner !== undefined && inputs.has(owner.name) && !isNonBuildFile(path.slice(owner.location.length + 1));
}

/**
 * Names the deployed sites a set of changed paths can change.
 *
 * A site is affected by its own files and by those of every workspace package it depends on,
 * read from the manifests, so a dependency added to an app becomes a trigger in the same
 * change. Paths no build reads from the working tree are ignored.
 * @param workspace Discovered workspace.
 * @param changedPaths Repository-relative POSIX paths.
 * @param sites Sites to consider. Defaults to {@link DEPLOYED_SITES}.
 * @returns Directory names of the affected sites, such as `www`, in the order of `sites`.
 * @throws When a site's location is not a workspace package.
 */
export function findAffectedSites(
  workspace: Workspace,
  changedPaths: readonly string[],
  sites: readonly DeployedSite[] = DEPLOYED_SITES,
): string[] {
  return sites
    .filter((site) => {
      const app = workspace.packages.find(({ location }) => location === site.location);
      if (app === undefined) {
        throw new Error(`No workspace package at ${site.location}, which is listed as a deployed site.`);
      }
      const inputs = dependencyClosure(app, workspace);
      return changedPaths.some((path) => affects(site, inputs, workspace, path));
    })
    .map(({ location }) => location.slice(location.lastIndexOf("/") + 1));
}
