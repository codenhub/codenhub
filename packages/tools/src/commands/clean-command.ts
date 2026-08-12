import { readdir, rm } from "node:fs/promises";
import { join, relative } from "node:path";

import type { SummaryRow } from "../reporting/reporter.ts";
import { EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

/** Directory names produced by builds, tests, and coverage runs. */
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
 * The search descends rather than only looking at the package root because
 * playgrounds and nested workspaces leave artifacts of their own, and it stops at
 * each artifact directory it finds so a `dist` containing a `coverage` is
 * reported once.
 * @param directory Absolute directory to search.
 * @returns Absolute artifact paths, directories and files alike.
 */
export async function findArtifactDirectories(directory: string): Promise<string[]> {
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
      return ARTIFACT_DIRECTORIES.has(entry.name) ? [entryPath] : findArtifactDirectories(entryPath);
    }),
  );
  return found.flat();
}

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

async function collectArtifacts(context: CommandContext): Promise<string[]> {
  const found = await Promise.all(
    context.selection.targets.map(async ({ package: workspacePackage }) =>
      findArtifactDirectories(workspacePackage.directory),
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
