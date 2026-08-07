import { execute, formatCommand, type CommandSpec } from "../process/execute.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

/** How a repository-wide tool is exposed as a command. */
export interface RootToolCommandOptions {
  /** Name typed to invoke the command. */
  name: string;
  /** One-line description shown in help output. */
  summary: string;
  /** Executable run once from the repository root. */
  command: string;
  /** Arguments always passed to the executable. */
  baseArgs?: readonly string[];
  /** Arguments added when the command only reports. */
  checkArgs?: readonly string[];
  /** Arguments added when `--fix` is requested. */
  fixArgs?: readonly string[];
  /** Paths used when no package was selected. */
  defaultPaths?: readonly string[];
}

/**
 * Turns a package selection into the paths a repository-wide tool should read.
 *
 * A selection without narrowing paths becomes the package directory, so
 * `hub lint error` and `hub lint packages/error/src/index.ts` both work. Paths
 * outside every package are included as-is, because repository-wide tools also
 * cover files such as `docs/` and root configuration.
 * @param context Current command context.
 * @param defaultPaths Paths used when nothing was selected explicitly.
 * @returns Repository-relative POSIX paths.
 */
export function resolveToolPaths(context: CommandContext, defaultPaths: readonly string[]): string[] {
  if (context.selection.isImplicit) {
    return [...defaultPaths];
  }
  return [
    ...context.selection.targets.flatMap(({ package: workspacePackage, paths }) =>
      paths.length === 0 ? [workspacePackage.location] : paths.map((path) => `${workspacePackage.location}/${path}`),
    ),
    ...context.selection.unownedPaths,
  ];
}

/**
 * Creates a command that runs a single repository-wide tool once.
 *
 * Selection is translated into paths instead of per-package processes, which
 * keeps whole-repository linting and formatting to one fast invocation.
 * @param options Executable, argument sets, and fallback paths.
 * @returns Command definition ready for registration.
 */
export function createRootToolCommand(options: RootToolCommandOptions): CommandDefinition {
  return {
    name: options.name,
    run: async (context) => {
      const paths = resolveToolPaths(context, options.defaultPaths ?? ["."]);
      if (paths.length === 0) {
        context.reporter.warn(`No paths matched for \`${options.name}\`.`);
        return EXIT_SUCCESS;
      }

      const modeArgs = context.options.shouldFix ? (options.fixArgs ?? []) : (options.checkArgs ?? []);
      const spec: CommandSpec = {
        args: [...(options.baseArgs ?? []), ...modeArgs, ...context.passthrough, ...paths],
        command: options.command,
        cwd: context.workspace.root,
      };

      if (context.options.isDryRun) {
        context.reporter.detail(`${spec.cwd}: ${formatCommand(spec)}`);
        return EXIT_SUCCESS;
      }

      const outcome = await execute(spec, { stdio: "inherit", timeoutMs: context.options.timeoutMs });
      return outcome.isSuccess ? EXIT_SUCCESS : EXIT_FAILURE;
    },
    summary: options.summary,
    usage: `hub ${options.name} [targets...] [--fix] [-- tool arguments]`,
  };
}
