import type { CommandDefinition } from "../commands/definition.ts";
import { listCommands } from "../commands/registry.ts";

const GLOBAL_OPTIONS: readonly (readonly [string, string])[] = [
  ["--changed[=<ref>]", "Narrow the selection to packages changed against <ref> (default main)."],
  ["--parallel[=<n>]", "Run up to <n> packages at the same time (default all)."],
  ["--bail", "Stop after the first failing package."],
  ["--no-build", "Skip prerequisite build steps."],
  ["--deps", "Include workspace dependencies in prerequisite builds."],
  ["--timeout=<seconds>", "Kill a package run after <seconds> (default 600)."],
  ["--no-timeout", "Never kill a package run."],
  ["--dry-run", "Print the commands that would run."],
  ["--fix", "Apply fixes instead of only reporting."],
  ["--pack", "Let checks run npm pack --dry-run to inspect publishable contents."],
  ["--json", "Emit machine-readable output where supported."],
  ["-h, --help", "Show this help."],
];

const TARGET_FORMS: readonly string[] = [
  "error                              package directory or name",
  "@codenhub/error                    full package name",
  "packages/error/src/bucket.test.ts  a path, forwarded to the tool",
  "packages/*/src/**/*.test.ts        a glob, expanded across packages",
  "--changed                          packages with uncommitted or branch changes",
];

function formatRows(rows: readonly (readonly [string, string])[]): string[] {
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`);
}

/**
 * Renders the top-level usage text.
 * @returns Help output describing commands, targets, and global options.
 */
export function renderHelp(): string {
  const commandRows = listCommands().map((command) => [command.name, command.summary] as const);

  return [
    "hub — workspace-aware repository tooling",
    "",
    "Usage:",
    "  hub <command> [targets...] [options] [-- tool arguments]",
    "",
    "Commands:",
    ...formatRows(commandRows),
    "",
    "  Any other name runs the package script of that name.",
    "",
    "Targets:",
    ...TARGET_FORMS.map((form) => `  ${form}`),
    "",
    "  Omitting targets selects every package.",
    "",
    "Options:",
    ...formatRows(GLOBAL_OPTIONS),
    "",
  ].join("\n");
}

/**
 * Renders usage text for one command.
 * @param command Command to describe.
 * @returns Help output for the command.
 */
export function renderCommandHelp(command: CommandDefinition): string {
  return [command.summary, "", "Usage:", `  ${command.usage}`, "", "Options:", ...formatRows(GLOBAL_OPTIONS), ""].join(
    "\n",
  );
}
