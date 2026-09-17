#!/usr/bin/env node
import { renderCommandHelp, renderHelp } from "./cli/help.ts";
import { parseArguments } from "./cli/parse-arguments.ts";
import { resolveCommandLine } from "./cli/resolve-command-line.ts";
import { readToolVersion } from "./cli/version.ts";
import { EXIT_FAILURE, EXIT_SUCCESS } from "./commands/definition.ts";
import { listCommands, resolveCommand } from "./commands/registry.ts";
import { createReporter } from "./reporting/reporter.ts";
import { findChangedPaths } from "./workspace/changed-packages.ts";
import { discoverWorkspace } from "./workspace/discover.ts";
import { findWorkspaceRoot } from "./workspace/find-root.ts";
import { selectPackages } from "./workspace/select-packages.ts";

async function main(): Promise<number> {
  const reporter = createReporter();
  const initial = parseArguments(process.argv.slice(2));

  if (initial.options.wantsVersion || initial.commandName === "version") {
    reporter.info(await readToolVersion());
    return EXIT_SUCCESS;
  }
  if (initial.commandName === "" || initial.commandName === "help") {
    reporter.info(renderHelp());
    return EXIT_SUCCESS;
  }
  const registeredCommand = listCommands().find(({ name }) => name === initial.commandName);
  if (initial.options.wantsHelp && registeredCommand !== undefined) {
    reporter.info(renderCommandHelp(registeredCommand));
    return EXIT_SUCCESS;
  }
  let root: string;
  try {
    root = await findWorkspaceRoot(process.cwd());
  } catch (error) {
    if (initial.options.wantsHelp) {
      reporter.info(renderCommandHelp(resolveCommand(initial.commandName)));
      return EXIT_SUCCESS;
    }
    throw error;
  }
  const workspace = await discoverWorkspace(root);
  const parsed = resolveCommandLine(initial, workspace);
  const command = resolveCommand(parsed.commandName);
  if (parsed.options.wantsHelp) {
    reporter.info(renderCommandHelp(command));
    return EXIT_SUCCESS;
  }

  if (command.selectsPackages === false) {
    const selection = { isImplicit: false, targets: [], unownedPaths: [] };
    return command.run({
      options: parsed.options,
      passthrough: parsed.passthrough,
      reporter,
      selection,
      tokens: parsed.tokens,
      workspace,
    });
  }

  const changedPaths = parsed.options.useChangedFilter
    ? await findChangedPaths(root, parsed.options.baseRef)
    : undefined;
  const selection = await selectPackages({ changedPaths, cwd: process.cwd(), tokens: parsed.tokens, workspace });

  if (selection.targets.length === 0 && selection.unownedPaths.length === 0) {
    reporter.warn("No packages matched the selection.");
    return EXIT_SUCCESS;
  }

  return command.run({
    options: parsed.options,
    passthrough: parsed.passthrough,
    reporter,
    selection,
    tokens: parsed.tokens,
    workspace,
  });
}

try {
  process.exitCode = await main();
} catch (error) {
  createReporter().error(error instanceof Error ? error.message : String(error));
  process.exitCode = EXIT_FAILURE;
}
