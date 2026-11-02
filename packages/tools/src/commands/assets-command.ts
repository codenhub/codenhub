import { relative } from "node:path";

import { createBrandSource, type BrandSource } from "../assets/brand-source.ts";
import { declaresAssets, syncPackageAssets } from "../assets/sync.ts";
import { mapSeries } from "../process/concurrency.ts";
import { formatDuration, type SummaryRow } from "../reporting/reporter.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

async function runAssetsCommand(context: CommandContext, source: BrandSource): Promise<number> {
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
      const result = await syncPackageAssets(workspacePackage, source);
      if (result.keptBecause !== undefined) {
        reporter.warn(`${label}: kept the files placed earlier, unchecked against the brand. ${result.keptBecause}`);
        return { detail: "kept earlier files, brand unreachable", label, status: "passed" };
      }
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
 * @param createSource Creates the source the run reads the brand from; tests pass an in-memory one.
 * @returns Command definition ready for registration.
 */
export function createAssetsCommand(createSource: () => BrandSource = createBrandSource): CommandDefinition {
  return {
    name: "assets",
    run: async (context) => runAssetsCommand(context, createSource()),
    summary: "Sync the selected packages' codenhub.assets from coden.agency/brand.",
    usage: "hub assets [targets...] [options]",
  };
}
