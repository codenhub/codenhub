import { mapConcurrent } from "../process/concurrency.ts";
import { execute, formatCommand, type CommandSpec } from "../process/execute.ts";
import { buildScriptSpec, resolveBinDirectories, withBinPath } from "../process/script-runner.ts";
import { formatDuration, type SummaryRow, type SummaryStatus } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";
import { buildPrerequisiteRuns, runPrerequisiteRuns, type RunSettings } from "./script-command.ts";

const SCRIPT = "typecheck";
const PREREQUISITE = "build";
const COMPILER = "tsc";
const PROJECT_CONFIG = "tsconfig.json";

/**
 * A `typecheck` script the compiler can run for several packages in one process.
 *
 * Build mode is what makes batching possible: it takes any number of projects,
 * and it skips the ones whose inputs have not changed since their last run.
 */
const PROJECT_BUILD_SCRIPT = /^tsc\s+(?:-b|--build)$/;

/** Leading `path(line,column):` of a compiler diagnostic. */
const DIAGNOSTIC_LOCATION = /^(?<path>[^(]+)\(\d+,\d+\):/;

/** One compiler invocation and the packages it covers. */
interface TypecheckUnit {
  /** Packages the invocation type-checks. */
  packages: readonly WorkspacePackage[];
  /** Command that type-checks them. */
  spec: CommandSpec;
}

/**
 * Splits items into a fixed number of groups, round-robin.
 *
 * Projects are dealt out rather than sliced into blocks because the order they
 * arrive in is the workspace's, which groups packages of a kind together; slicing
 * it would put the slowest packages in one group and leave the rest idle.
 * @param items Items to distribute.
 * @param groups Number of groups to fill.
 * @returns Non-empty groups, in the order they were filled.
 */
export function shardEvenly<TItem>(items: readonly TItem[], groups: number): TItem[][] {
  const shards = Array.from({ length: Math.max(1, groups) }, (): TItem[] => []);
  items.forEach((item, index) => (shards[index % shards.length] as TItem[]).push(item));
  return shards.filter((shard) => shard.length > 0);
}

/**
 * Finds which packages a batched compiler run reported diagnostics for.
 *
 * A batch covers several packages but exits once, so the exit code alone would
 * mark every package in it as failed. Diagnostics carry the file they came from,
 * which is enough to name the packages that actually broke.
 * @param output Captured compiler output.
 * @param packages Packages the run covered.
 * @returns Names of the packages a diagnostic was reported for.
 */
export function attributeDiagnostics(output: string, packages: readonly WorkspacePackage[]): Set<string> {
  const failed = new Set<string>();

  for (const line of output.split("\n")) {
    const location = DIAGNOSTIC_LOCATION.exec(line.trim())?.groups?.path;
    if (location === undefined) {
      continue;
    }
    const path = location.replaceAll("\\", "/");
    // The longest match wins: a nested package's location starts with its
    // parent's, so the first prefix to match is not always the owner.
    const owner = packages
      .filter((workspacePackage) => path.includes(`${workspacePackage.location}/`))
      .sort((left, right) => right.location.length - left.location.length)[0];
    if (owner !== undefined) {
      failed.add(owner.name);
    }
  }
  return failed;
}

function toStatus(
  outcome: Awaited<ReturnType<typeof execute>>,
  workspacePackage: WorkspacePackage,
  failed: ReadonlySet<string>,
): SummaryStatus {
  if (outcome.didTimeOut) {
    return "timed-out";
  }
  if (outcome.isSuccess) {
    return "passed";
  }
  // A run that failed without naming a file failed as a whole, so every package
  // it covered is reported rather than none of them.
  return failed.size === 0 || failed.has(workspacePackage.name) ? "failed" : "passed";
}

function buildUnits(context: CommandContext, packages: readonly WorkspacePackage[], root: string): TypecheckUnit[] {
  const batched = packages.filter((workspacePackage) =>
    PROJECT_BUILD_SCRIPT.test(workspacePackage.scripts[SCRIPT] as string),
  );
  const scripted = packages.filter(
    (workspacePackage) => !PROJECT_BUILD_SCRIPT.test(workspacePackage.scripts[SCRIPT] as string),
  );
  // One process per free slot, not one per package: most of a project's cost is
  // loading the compiler and its libraries, and a batch pays that once. The
  // packages that run their own script take a slot each, so the batches claim
  // what is left rather than queueing behind them.
  const slots = Math.min(context.options.concurrency - scripted.length, batched.length);
  const shards = shardEvenly(batched, slots);

  return [
    // A package with its own script is the slow one in the run often enough that
    // it starts first: nothing else in the list can be shortened by waiting.
    ...scripted.map<TypecheckUnit>((workspacePackage) => ({
      packages: [workspacePackage],
      spec: buildScriptSpec(workspacePackage, SCRIPT, context.passthrough, root),
    })),
    ...shards.map<TypecheckUnit>((shard) => ({
      packages: shard,
      spec: {
        args: ["-b", ...shard.map(({ location }) => `${location}/${PROJECT_CONFIG}`), ...context.passthrough],
        command: COMPILER,
        cwd: root,
        env: withBinPath(resolveBinDirectories(root, root)),
      },
    })),
  ];
}

async function runUnits(
  context: CommandContext,
  units: readonly TypecheckUnit[],
  settings: RunSettings,
): Promise<SummaryRow[]> {
  const { reporter } = context;
  const rows = new Map<string, SummaryRow>();

  await mapConcurrent(units, Math.max(1, Math.min(settings.concurrency, units.length)), async (unit) => {
    const outcome = await execute(unit.spec, {
      stdio: settings.streams ? "inherit" : "pipe",
      timeoutMs: settings.timeoutMs,
    });
    const output = outcome.output?.trimEnd() ?? "";
    if (!settings.streams && output !== "" && (settings.showsPassing || !outcome.isSuccess)) {
      reporter.blank();
      // A diagnostic names its own file, so a batch needs no heading. A single
      // package's script can print anything at all, and does need one.
      if (unit.packages.length === 1) {
        reporter.step(`${(unit.packages[0] as WorkspacePackage).name} › ${SCRIPT}`);
      }
      reporter.info(output);
    }
    const failed = outcome.isSuccess ? new Set<string>() : attributeDiagnostics(output, unit.packages);
    for (const workspacePackage of unit.packages) {
      rows.set(workspacePackage.name, {
        detail: formatDuration(outcome.durationMs),
        label: workspacePackage.name,
        status: toStatus(outcome, workspacePackage, failed),
      });
    }
  });

  return units.flatMap(({ packages }) => packages.map(({ name }) => rows.get(name) as SummaryRow));
}

async function runTypecheckCommand(context: CommandContext): Promise<number> {
  const { reporter, selection } = context;
  const root = context.workspace.root;
  const runnable = selection.targets.filter(
    ({ package: workspacePackage }) => workspacePackage.scripts[SCRIPT] !== undefined,
  );
  const skipped = selection.targets.length - runnable.length;

  if (selection.unownedPaths.length > 0) {
    reporter.warn(
      `\`hub ${SCRIPT}\` runs whole projects and ignored ${selection.unownedPaths.length} path(s) outside every package.`,
    );
  }
  if (runnable.length === 0) {
    reporter.warn(`No selected package defines a "${SCRIPT}" script.`);
    return EXIT_SUCCESS;
  }

  const packages = runnable.map(({ package: workspacePackage }) => workspacePackage);
  const units = buildUnits(context, packages, root);
  const prerequisiteRuns = buildPrerequisiteRuns(context, PREREQUISITE, runnable, root);

  if (context.options.isDryRun) {
    reporter.step(`Would run \`${SCRIPT}\` in ${packages.length} package(s)`);
    for (const spec of [...prerequisiteRuns.map(({ spec }) => spec), ...units.map(({ spec }) => spec)]) {
      reporter.detail(`  ${spec.cwd}: ${formatCommand(spec)}`);
    }
    return EXIT_SUCCESS;
  }

  const isVerbose = context.options.isVerbose;
  const settings: RunSettings = {
    bails: context.options.shouldBail,
    concurrency: context.options.concurrency,
    respectsDependencies: false,
    showsPassing: isVerbose,
    streams: isVerbose && units.length === 1,
    timeoutMs: context.options.timeoutMs,
  };

  if (!(await runPrerequisiteRuns(context, PREREQUISITE, SCRIPT, prerequisiteRuns, settings))) {
    return EXIT_FAILURE;
  }

  if (!settings.streams) {
    reporter.blank();
    reporter.step(`${SCRIPT} › ${packages.length} package(s)`);
  }
  const startedAt = performance.now();
  const rows = await runUnits(context, units, settings);
  const hasFailure = rows.some(({ status }) => status === "failed" || status === "timed-out");

  reporter.blank();
  if (hasFailure || isVerbose) {
    reporter.summarize(isVerbose ? rows : rows.filter(({ status }) => status !== "passed"));
  }
  reporter.tally(rows, performance.now() - startedAt);
  if (skipped > 0) {
    reporter.detail(`  ${skipped} package(s) without a "${SCRIPT}" script were skipped.`);
  }
  return hasFailure ? EXIT_FAILURE : EXIT_SUCCESS;
}

/**
 * Creates the command that type-checks the selected packages.
 *
 * It is not a plain script command because the compiler can type-check many
 * projects in one process, and because its build mode keeps a record of what it
 * already checked. Running the script once per package throws both away: every
 * package reloads the compiler, and none of them remembers the run before it. A
 * package whose `typecheck` script is not a bare build-mode invocation still runs
 * as its own script, so a package that needs a step of its own keeps it.
 * @returns Command definition ready for registration.
 */
export function createTypecheckCommand(): CommandDefinition {
  return {
    name: SCRIPT,
    run: runTypecheckCommand,
    summary: "Type-check the selected packages.",
    usage: `hub ${SCRIPT} [targets...] [options] [-- compiler arguments]`,
  };
}
