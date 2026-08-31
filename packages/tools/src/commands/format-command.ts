import { execute, formatCommand, type CommandSpec } from "../process/execute.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";
import { resolveToolPaths } from "./root-tool-command.ts";

/** Trailing file extension of a resolved path, `.md` included. */
const FILE_EXTENSION = /\.[^./\\]+$/;

/**
 * Turns resolved tool paths into the Markdown targets Prettier should format.
 *
 * `oxfmt` owns every other format, so Prettier is only ever handed Markdown: a
 * selected directory becomes its `**\/*.md` subtree, a `.md` file is kept as
 * typed, and a file of any other kind is dropped. The whole-repository fallback
 * collapses to a single recursive glob so one invocation covers the tree.
 * @param paths Repository-relative paths from {@link resolveToolPaths}.
 * @returns Markdown globs and files, de-duplicated in the order they resolved.
 */
export function resolveMarkdownTargets(paths: readonly string[]): string[] {
  const targets = paths.flatMap((path) => {
    if (path === ".") {
      return ["**/*.md"];
    }
    if (path.endsWith(".md")) {
      return [path];
    }
    if (FILE_EXTENSION.test(path)) {
      return [];
    }
    return [`${path.replace(/[/\\]$/, "")}/**/*.md`];
  });
  return [...new Set(targets)];
}

/**
 * Runs one formatter and reports what it wrote.
 *
 * Output is streamed for `--fix` and `--verbose` and captured otherwise, so a
 * plain check still prints every finding: a formatter can exit non-zero with
 * nothing on stdout, and keying the echo off the exit code would drop it.
 * @param context Current command context.
 * @param spec Formatter invocation to run.
 * @returns `EXIT_SUCCESS` when the formatter exited zero, `EXIT_FAILURE` otherwise.
 */
async function runFormatter(context: CommandContext, spec: CommandSpec): Promise<number> {
  if (context.options.isDryRun) {
    context.reporter.detail(`${spec.cwd}: ${formatCommand(spec)}`);
    return EXIT_SUCCESS;
  }

  const streams = context.options.isVerbose || context.options.shouldFix;
  const outcome = await execute(spec, {
    stdio: streams ? "inherit" : "pipe",
    timeoutMs: context.options.timeoutMs,
  });
  const captured = outcome.output?.trimEnd() ?? "";
  if (!streams && captured !== "") {
    context.reporter.info(captured);
  }
  return outcome.isSuccess ? EXIT_SUCCESS : EXIT_FAILURE;
}

/**
 * Creates the command that formats the selected paths.
 *
 * `oxfmt` formats everything it recognises, then Prettier formats the Markdown
 * it does not, so one `format` step keeps the whole tree consistent. The two run
 * in sequence and both always run: a failure in one still leaves the other's
 * findings, or fixes, worth having. Tool arguments after `--` reach `oxfmt`
 * only, because Prettier shares none of its flags.
 * @returns Command definition ready for registration.
 */
export function createFormatCommand(): CommandDefinition {
  return {
    name: "format",
    run: async (context) => {
      const paths = resolveToolPaths(context, ["."]);
      if (paths.length === 0) {
        context.reporter.warn("No paths matched for `format`.");
        return EXIT_SUCCESS;
      }

      const root = context.workspace.root;
      const markdown = resolveMarkdownTargets(paths);

      // `oxfmt` first, over every path; it ignores Markdown by config, so a
      // Markdown-only selection leaves it with nothing to format, which
      // `--no-error-on-unmatched-pattern` keeps from being a failure.
      const oxfmtCode = await runFormatter(context, {
        args: [
          ...(context.options.shouldFix ? [] : ["--check"]),
          "--no-error-on-unmatched-pattern",
          ...context.passthrough,
          ...paths,
        ],
        command: "oxfmt",
        cwd: root,
      });

      // Prettier second, over the Markdown among the paths. Both formatters
      // always run: a failure in one still leaves the other's findings or fixes
      // worth having.
      const prettierCode =
        markdown.length === 0
          ? EXIT_SUCCESS
          : await runFormatter(context, {
              args: [
                context.options.shouldFix ? "--write" : "--check",
                "--no-error-on-unmatched-pattern",
                "--log-level",
                "warn",
                ...markdown,
              ],
              command: "prettier",
              cwd: root,
            });

      return oxfmtCode === EXIT_SUCCESS && prettierCode === EXIT_SUCCESS ? EXIT_SUCCESS : EXIT_FAILURE;
    },
    summary: "Check formatting of the selected paths, or fix it with --fix.",
    usage: "hub format [targets...] [--fix] [-- oxfmt arguments]",
  };
}
