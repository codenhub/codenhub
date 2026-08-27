import { relative } from "node:path";

import { declaresAssets, syncPackageAssets } from "../assets/sync.ts";
import { mapSeries } from "../process/concurrency.ts";
import { formatDuration, type SummaryRow } from "../reporting/reporter.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

async function runAssetsCommand(context: CommandContext): Promise<number> {
  const { reporter, workspace } = context;
  const packages = context.selection.targets
    .map(({ package: workspacePackage }) => workspacePackage)
    .filter(declaresAssets);

  if (packages.length === 0) {
    reporter.warn("No selected package declares codenhub.assets.");
    return EXIT_SUCCESS;
  }

  if (context.options.isDryRun) {
    reporter.step(`Would sync assets for ${packages.length} package(s)`);
    for (const workspacePackage of packages) {
      reporter.detail(`  ${toPosix(relative(workspace.root, workspacePackage.directory))}`);
    }
    return EXIT_SUCCESS;
  }

  const rows = await mapSeries(packages, async (workspacePackage): Promise<SummaryRow> => {
    const label = toPosix(relative(workspace.root, workspacePackage.directory));
    const startedAt = performance.now();
    try {
      const result = await syncPackageAssets(workspacePackage, workspace.root);
      return { detail: `${result.copied.length} placed, ${result.removed.length} removed`, label, status: "passed" };
    } catch (cause) {
      reporter.blank();
      reporter.error((cause as Error).message);
      return { detail: formatDuration(performance.now() - startedAt), label, status: "failed" };
    }
  });
  const hasFailure = rows.some((row) => row.status === "failed");

  reporter.blank();
  reporter.summarize(rows);
  reporter.tally(rows);
  return hasFailure ? EXIT_FAILURE : EXIT_SUCCESS;
}

/**
 * Creates the command that syncs `codenhub.assets` for the selected packages.
 *
 * Placement stays each package's own decision: this only copies `from` to `to` as
 * declared and removes what a package no longer declares. It never assumes where
 * a file belongs.
 * @returns Command definition ready for registration.
 */
export function createAssetsCommand(): CommandDefinition {
  return {
    name: "assets",
    run: runAssetsCommand,
    summary: "Sync the selected packages' codenhub.assets from root assets/.",
    usage: "hub assets [targets...] [options]",
  };
}
