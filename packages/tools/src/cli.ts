#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { renderCommandHelp, renderHelp } from "./cli/help.ts";
import { parseArguments } from "./cli/parse-arguments.ts";
import { readToolVersion } from "./cli/version.ts";
import { EXIT_FAILURE, EXIT_SUCCESS } from "./commands/definition.ts";
import { resolveCommand } from "./commands/registry.ts";
import { createReporter } from "./reporting/reporter.ts";
import { findChangedPaths } from "./workspace/changed-packages.ts";
import { discoverWorkspace } from "./workspace/discover.ts";
import { selectPackages } from "./workspace/select-packages.ts";

const WORKSPACE_MANIFEST = "pnpm-workspace.yaml";

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

/**
 * Walks up from a directory to the repository root.
 *
 * The root is identified by the pnpm workspace manifest so the executable behaves
 * the same from any package directory.
 * @param startDirectory Directory to start searching from.
 * @returns Absolute repository root.
 * @throws When no workspace manifest exists in any parent directory.
 */
export async function findWorkspaceRoot(startDirectory: string): Promise<string> {
  async function search(directory: string): Promise<string> {
    if (await isFile(resolve(directory, WORKSPACE_MANIFEST))) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(`Could not find ${WORKSPACE_MANIFEST} in ${startDirectory} or any parent directory.`);
    }
    return search(parent);
  }
  return search(resolve(startDirectory));
}

async function main(): Promise<number> {
  const reporter = createReporter();
  const parsed = parseArguments(process.argv.slice(2));

  if (parsed.options.wantsVersion || parsed.commandName === "version") {
    reporter.info(await readToolVersion());
    return EXIT_SUCCESS;
  }
  if (parsed.commandName === "" || parsed.commandName === "help") {
    reporter.info(renderHelp());
    return EXIT_SUCCESS;
  }

  const command = resolveCommand(parsed.commandName);
  if (parsed.options.wantsHelp) {
    reporter.info(renderCommandHelp(command));
    return EXIT_SUCCESS;
  }

  const root = await findWorkspaceRoot(process.cwd());
  const workspace = await discoverWorkspace(root);
  const changedPaths = parsed.options.useChangedFilter
    ? await findChangedPaths(root, parsed.options.baseRef)
    : undefined;
  const selection = await selectPackages({ changedPaths, cwd: process.cwd(), tokens: parsed.tokens, workspace });

  if (selection.targets.length === 0 && selection.unownedPaths.length === 0) {
    reporter.warn("No packages matched the selection.");
    return EXIT_SUCCESS;
  }

  return command.run({ options: parsed.options, passthrough: parsed.passthrough, reporter, selection, workspace });
}

try {
  process.exitCode = await main();
} catch (error) {
  createReporter().error(error instanceof Error ? error.message : String(error));
  process.exitCode = EXIT_FAILURE;
}
