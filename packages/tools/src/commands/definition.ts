import type { CliOptions } from "../cli/parse-arguments.ts";
import type { Reporter } from "../reporting/reporter.ts";
import type { Workspace } from "../workspace/discover.ts";
import type { Selection } from "../workspace/select-packages.ts";

/** Everything a command needs to run one invocation. */
export interface CommandContext {
  /** Discovered workspace. */
  workspace: Workspace;
  /** Packages the command should act on. */
  selection: Selection;
  /** Global options parsed from the command line. */
  options: CliOptions;
  /** Arguments forwarded to the underlying tool. */
  passthrough: readonly string[];
  /** Terminal output surface. */
  reporter: Reporter;
}

/** A command exposed by the `hub` executable. */
export interface CommandDefinition {
  /** Name typed to invoke the command. */
  name: string;
  /** One-line description shown in help output. */
  summary: string;
  /** Usage line shown in help output. */
  usage: string;
  /** Runs the command. Resolves to the process exit code. */
  run(context: CommandContext): Promise<number>;
}

/** Exit code used when a command completes without failures. */
export const EXIT_SUCCESS = 0;

/** Exit code used when a command reports at least one failure. */
export const EXIT_FAILURE = 1;
