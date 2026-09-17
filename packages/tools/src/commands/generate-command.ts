import { applyGenerated } from "../generators/apply-generated.ts";
import type { GeneratedFile } from "../generators/generator.ts";
import { buildScriptSpec } from "../process/script-runner.ts";
import type { SummaryRow } from "../reporting/reporter.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";
import { runPackageBatch, type PackageRun, type RunSettings } from "./script-command.ts";

const SCRIPT = "generate";

async function generateFiles(context: CommandContext): Promise<GeneratedFile[]> {
  // The generators pull in a Markdown parser, which every other command can do without.
  const { createGenerators } = await import("../generators/registry.ts");
  const generatorContext = {
    // Coverage is measured rather than read from `selection.isImplicit` so that
    // naming every package explicitly regenerates the workspace-wide files too.
    isWholeWorkspace: context.selection.targets.length === context.workspace.packages.length,
    packages: context.selection.targets.map(({ package: workspacePackage }) => workspacePackage),
    workspace: context.workspace,
  };
  const results = await Promise.all(createGenerators().map(async (generator) => generator.generate(generatorContext)));
  return results.flat();
}

/**
 * Runs `generate` for every selected package that owns the script itself.
 *
 * A generator specific to one package, such as `@codenhub/styles`' palette,
 * is not registered here -- it is that package's own `generate` script,
 * dispatched the same way `hub test` or `hub typecheck` dispatch to a
 * package's own script. `--dry-run` is forwarded as an argument rather than
 * handled by the batch runner itself, because it means something different
 * here: the script still has to run to know whether it would write anything,
 * not be skipped the way a dry `build` or `test` run skips its command.
 * @param context Command invocation.
 * @param isDryRun Whether to forward `--dry-run` instead of writing.
 * @returns One row per package that owns a `generate` script.
 */
async function runPackageGenerators(context: CommandContext, isDryRun: boolean): Promise<SummaryRow[]> {
  const { reporter, selection } = context;
  const runnable = selection.targets.filter(
    ({ package: workspacePackage }) => workspacePackage.scripts[SCRIPT] !== undefined,
  );

  if (runnable.length === 0) {
    return [];
  }

  const runs: PackageRun[] = runnable.map(({ package: workspacePackage }) => ({
    spec: buildScriptSpec(workspacePackage, SCRIPT, isDryRun ? ["--dry-run"] : [], context.workspace.root),
    workspacePackage,
  }));
  const isVerbose = context.options.isVerbose;
  const settings: RunSettings = {
    bails: context.options.shouldBail,
    concurrency: context.options.concurrency,
    // Package generators do not depend on each other's output the way a build
    // does, so there is nothing here for dependency order to protect.
    respectsDependencies: false,
    showsPassing: isVerbose,
    streams: false,
    timeoutMs: context.options.timeoutMs,
  };

  reporter.blank();
  reporter.step(`${SCRIPT} › ${runs.length} package(s)`);
  return runPackageBatch(context, SCRIPT, runs, settings);
}

/**
 * Creates the command that regenerates derived repository files.
 *
 * Files are only written when their content actually changes, so a clean run
 * leaves the working tree untouched.
 * @returns Command definition ready for registration.
 */
export function createGenerateCommand(): CommandDefinition {
  return {
    name: SCRIPT,
    run: async (context) => {
      const root = context.workspace.root;
      const isDryRun = context.options.isDryRun;
      const [fileOutcomes, packageRows] = await Promise.all([
        generateFiles(context).then(async (files) => applyGenerated(files, { dryRun: isDryRun, root })),
        runPackageGenerators(context, isDryRun),
      ]);
      const staleFiles = fileOutcomes.filter(({ hasDrift }) => hasDrift);
      const failedPackages = packageRows.filter(({ status }) => status === "failed" || status === "timed-out");

      if (isDryRun) {
        context.reporter.step(`${staleFiles.length} of ${fileOutcomes.length} generated file(s) are out of date`);
        for (const { file } of staleFiles) {
          context.reporter.detail(`  ${file.path}`);
        }
        if (failedPackages.length > 0) {
          context.reporter.blank();
          context.reporter.summarize(context.options.isVerbose ? packageRows : failedPackages);
        }
        return staleFiles.length > 0 || failedPackages.length > 0 ? EXIT_FAILURE : EXIT_SUCCESS;
      }

      const isVerbose = context.options.isVerbose;
      const fileRows = fileOutcomes.map<SummaryRow>(({ file, hasDrift }) => ({
        detail: hasDrift ? "written" : "unchanged",
        label: file.path,
        status: hasDrift ? "passed" : "skipped",
      }));
      // A file row is news only when it changed; a package row is news when it
      // failed -- the same split every other batch command in this file draws.
      const visibleFileRows = isVerbose ? fileRows : fileRows.filter(({ status }) => status === "passed");
      const visiblePackageRows = isVerbose
        ? packageRows
        : packageRows.filter(({ status }) => status !== "passed" && status !== "skipped");

      context.reporter.summarize([...visibleFileRows, ...visiblePackageRows]);
      context.reporter.blank();
      context.reporter.detail(`  ${staleFiles.length} of ${fileOutcomes.length} file(s) written`);
      if (packageRows.length > 0) {
        context.reporter.detail(`  ${packageRows.length} package generator(s) run`);
      }
      return failedPackages.length > 0 ? EXIT_FAILURE : EXIT_SUCCESS;
    },
    summary: "Regenerate derived files such as llms-full.txt and the README package list.",
    usage: "hub generate [targets...] [--dry-run]",
  };
}
