import { relative } from "node:path";

import { planBrowserInstalls } from "../browsers/playwright.ts";
import { mapConcurrent } from "../process/concurrency.ts";
import { execute, formatCommand } from "../process/execute.ts";
import { formatDuration, type SummaryRow } from "../reporting/reporter.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

async function runBrowsersCommand(context: CommandContext): Promise<number> {
  const { reporter, workspace } = context;
  const packages = context.selection.targets.map(({ package: workspacePackage }) => workspacePackage);
  // Extra arguments reach Playwright, which is how CI asks for the operating
  // system packages a headless browser needs with `--with-deps`.
  const specs = await planBrowserInstalls(workspace.root, packages, context.passthrough);

  if (specs.length === 0) {
    reporter.warn("No selected package declares @playwright/test.");
    return EXIT_SUCCESS;
  }
  if (context.options.isDryRun) {
    reporter.step(`Would install browsers for ${specs.length} Playwright version(s)`);
    for (const spec of specs) {
      reporter.detail(`  ${spec.cwd}: ${formatCommand(spec)}`);
    }
    return EXIT_SUCCESS;
  }

  // Installs are sequential: they write to one shared browser cache, and two
  // downloads racing into it is how a half-extracted browser happens.
  const rows = await mapConcurrent(specs, 1, async (spec) => {
    const label = toPosix(relative(workspace.root, spec.cwd));
    reporter.blank();
    reporter.step(`${label} › playwright install`);
    const outcome = await execute(spec, { stdio: "inherit", timeoutMs: context.options.timeoutMs });
    if (outcome.didTimeOut) {
      return { detail: formatDuration(outcome.durationMs), label, status: "timed-out" } satisfies SummaryRow;
    }
    return {
      detail: formatDuration(outcome.durationMs),
      label,
      status: outcome.isSuccess ? "passed" : "failed",
    } satisfies SummaryRow;
  });

  reporter.blank();
  reporter.summarize(rows);
  return rows.some(({ status }) => status !== "passed") ? EXIT_FAILURE : EXIT_SUCCESS;
}

/**
 * Creates the command that installs the browsers Playwright tests need.
 *
 * The install is managed here rather than left to each contributor so a browser
 * test run cannot fail on a machine that simply never downloaded a browser, and
 * so CI and a laptop install the same versions from the same command.
 * @returns Command definition ready for registration.
 */
export function createBrowsersCommand(): CommandDefinition {
  return {
    name: "browsers",
    run: runBrowsersCommand,
    summary: "Install the Playwright browsers the selected packages test against.",
    usage: "hub browsers [targets...] [options] [-- playwright arguments]",
  };
}
