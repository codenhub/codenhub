import { readdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import type { SummaryRow } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

/**
 * Directory names produced by builds, tests, and coverage runs.
 *
 * A name only matches as a direct child of a package root: elsewhere it is an
 * ordinary source folder, such as `src/coverage`.
 */
const ARTIFACT_DIRECTORIES = new Set([".astro", "coverage", "dist", "test-results"]);

/**
 * File extension of the record the compiler keeps of a project it checked.
 *
 * It is removed with the rest: left behind, it tells the next type-check that
 * projects whose output has just been deleted are still up to date.
 */
const ARTIFACT_FILE_EXTENSION = ".tsbuildinfo";

/** Directory names never descended into while searching for artifacts. */
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

/**
 * Finds every build artifact under one directory.
 *
 * The search descends through the whole tree, because playgrounds and nested
 * workspaces leave `*.tsbuildinfo` records of their own. An artifact directory
 * name matches only when its parent is one of `packageRoots`, so a source folder
 * such as `src/coverage` is searched but never removed. A matched directory is
 * not descended into, so a `dist` containing a `coverage` is reported once.
 * @param directory Absolute directory to search.
 * @param packageRoots Absolute package root directories, where artifact directories live.
 * @returns Absolute artifact paths, directories and files alike.
 */
export async function findArtifactDirectories(directory: string, packageRoots: ReadonlySet<string>): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const entryPath = join(directory, entry.name);
      if (entry.isFile()) {
        return entry.name.endsWith(ARTIFACT_FILE_EXTENSION) ? [entryPath] : [];
      }
      if (!entry.isDirectory() || entry.isSymbolicLink() || SKIPPED_DIRECTORIES.has(entry.name)) {
        return [];
      }
      if (ARTIFACT_DIRECTORIES.has(entry.name) && packageRoots.has(directory)) {
        return [entryPath];
      }
      return findArtifactDirectories(entryPath, packageRoots);
    }),
  );
  return found.flat();
}

/**
 * Lists the package roots that count for one selected package.
 *
 * These are its own directory and the directory of every workspace package nested
 * below it, since a nested workspace is a package in its own right.
 * @param selected Package the user selected.
 * @param packages Every workspace package.
 * @returns Absolute package root directories.
 */
function packageRootsWithin(selected: WorkspacePackage, packages: readonly WorkspacePackage[]): Set<string> {
  const nested = packages
    .map((workspacePackage) => workspacePackage.directory)
    .filter((directory) => isNestedWithin(selected.directory, directory));
  return new Set([selected.directory, ...nested]);
}

function isNestedWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== "" && !isAbsolute(path) && path.split(sep)[0] !== "..";
}

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

async function collectArtifacts(context: CommandContext): Promise<string[]> {
  const found = await Promise.all(
    context.selection.targets.map(async ({ package: workspacePackage }) =>
      findArtifactDirectories(
        workspacePackage.directory,
        packageRootsWithin(workspacePackage, context.workspace.packages),
      ),
    ),
  );
  // Nested workspace packages are reachable from their parent as well as from
  // their own selection entry, so the same directory can be found twice.
  return [...new Set(found.flat())].sort();
}

/**
 * Creates the command that removes build and test artifacts.
 *
 * Dependencies are left alone: `node_modules` is the package manager's to
 * manage, and removing it turns a seconds-long cleanup into a reinstall.
 * @returns Command definition ready for registration.
 */
export function createCleanCommand(): CommandDefinition {
  return {
    name: "clean",
    run: async (context) => {
      const artifacts = await collectArtifacts(context);
      const paths = artifacts.map((artifact) => toPosix(relative(context.workspace.root, artifact)));

      if (artifacts.length === 0) {
        context.reporter.detail("  Nothing to clean.");
        return EXIT_SUCCESS;
      }
      if (context.options.isDryRun) {
        context.reporter.step(`Would remove ${artifacts.length} artifact(s)`);
        for (const path of paths) {
          context.reporter.detail(`  ${path}`);
        }
        return EXIT_SUCCESS;
      }

      await Promise.all(artifacts.map(async (artifact) => rm(artifact, { force: true, recursive: true })));
      context.reporter.summarize(
        paths.map<SummaryRow>((path) => ({ detail: "removed", label: path, status: "passed" })),
      );
      context.reporter.blank();
      context.reporter.detail(`  ${artifacts.length} artifact(s) removed`);
      return EXIT_SUCCESS;
    },
    summary: "Remove build and test artifacts from the selected packages.",
    usage: "hub clean [targets...] [--dry-run]",
  };
}
