import { createCheckCommand } from "./check-command.ts";
import { createCleanCommand } from "./clean-command.ts";
import type { CommandDefinition } from "./definition.ts";
import { createGenerateCommand } from "./generate-command.ts";
import { createListCommand } from "./list-command.ts";
import { createNewCommand } from "./new-command.ts";
import { createRootToolCommand } from "./root-tool-command.ts";
import { createScriptCommand } from "./script-command.ts";
import { createVerifyCommand } from "./verify-command.ts";

const CLOC_EXCLUDED_DIRECTORIES = "node_modules,dist,coverage,test-results,.git";
const CLOC_EXCLUDED_EXTENSIONS = "md,yaml,json";

const COMMANDS: readonly CommandDefinition[] = [
  createScriptCommand({ name: "build", summary: "Build the selected packages." }),
  createScriptCommand({
    forwardsPaths: true,
    name: "test",
    prerequisite: "build",
    summary: "Run tests, optionally narrowed to files or directories.",
  }),
  createScriptCommand({
    forwardsPaths: true,
    name: "test:coverage",
    prerequisite: "build",
    summary: "Run tests with a coverage report.",
  }),
  createScriptCommand({
    forwardsPaths: true,
    isInteractive: true,
    name: "test:watch",
    prerequisite: "build",
    summary: "Run tests in watch mode for one package.",
  }),
  createScriptCommand({ name: "typecheck", prerequisite: "build", summary: "Type-check the selected packages." }),
  createScriptCommand({ name: "status:npm", summary: "Report published registry metadata." }),
  createScriptCommand({
    name: "status:pack",
    prerequisite: "build",
    summary: "Report publishable package contents.",
  }),
  createRootToolCommand({
    command: "oxlint",
    fixArgs: ["--fix"],
    name: "lint",
    summary: "Lint the selected paths, or the whole repository.",
  }),
  createRootToolCommand({
    checkArgs: ["--check"],
    command: "oxfmt",
    name: "format",
    summary: "Check formatting of the selected paths, or fix it with --fix.",
  }),
  createRootToolCommand({
    baseArgs: [`--exclude-dir=${CLOC_EXCLUDED_DIRECTORIES}`, `--exclude-ext=${CLOC_EXCLUDED_EXTENSIONS}`],
    command: "cloc",
    name: "cloc",
    summary: "Count lines of code in the selected paths, or the whole repository.",
  }),
  createVerifyCommand(),
  createCheckCommand(),
  createGenerateCommand(),
  createCleanCommand(),
  createNewCommand(),
  createListCommand(),
];

/**
 * Every command with a dedicated definition.
 * @returns Registered commands in help order.
 */
export function listCommands(): readonly CommandDefinition[] {
  return COMMANDS;
}

/**
 * Resolves a command name to its definition.
 *
 * Names without a dedicated definition fall back to running a package script of
 * the same name, so package-specific scripts such as `dev` and `debug` work
 * without being registered.
 * @param name Command or package script name.
 * @returns Command definition to run.
 */
export function resolveCommand(name: string): CommandDefinition {
  return (
    COMMANDS.find((command) => command.name === name) ??
    createScriptCommand({ name, summary: `Run the "${name}" package script.` })
  );
}
