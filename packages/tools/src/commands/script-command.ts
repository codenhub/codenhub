import { mapConcurrent, mapSeries } from "../process/concurrency.ts";
import { formatCommand, type CommandSpec, execute } from "../process/execute.ts";
import { buildScriptSpec } from "../process/script-runner.ts";
import { formatDuration, type SummaryRow } from "../reporting/reporter.ts";
import {
  groupByDependencyLevel,
  orderByDependencies,
  withWorkspaceDependencies,
} from "../workspace/dependency-order.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { PackageSelection } from "../workspace/select-packages.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

/** How a package script is exposed as a command. */
export interface ScriptCommandOptions {
  /** Name typed to invoke the command. */
  name: string;
  /** One-line description shown in help output. */
  summary: string;
  /** Package script to run. Defaults to the command name. */
  script?: string;
  /** Script that must succeed for each package before the main script runs. */
  prerequisite?: string;
  /**
   * Whether the selection expands to workspace dependencies and runs
   * dependency-first.
   *
   * It is what `prerequisite` does for every other command, applied to the script
   * itself: `build` cannot build its own dependencies as a prerequisite without
   * building each selected package twice.
   */
  includesDependencies?: boolean;
  /** Whether the command keeps a terminal attached and refuses multiple packages. */
  isInteractive?: boolean;
  /** Whether selected paths are forwarded to the script. */
  forwardsPaths?: boolean;
  /**
   * Builds commands that must succeed before the script runs.
   *
   * It covers what the script needs but must not do itself, such as installing
   * the managed browsers a browser test run depends on. Specs are returned rather
   * than executed so `--dry-run` can print them and one runner reports them all.
   */
  prepare?(context: CommandContext, packages: readonly WorkspacePackage[]): Promise<readonly CommandSpec[]>;
}

function collectScriptPackages(
  context: CommandContext,
  targets: readonly PackageSelection[],
  script: string,
): WorkspacePackage[] {
  const packages = targets.map(({ package: workspacePackage }) => workspacePackage);
  const expanded = context.options.shouldBuildDependencies
    ? withWorkspaceDependencies(packages, context.workspace.packages)
    : orderByDependencies(packages);
  return expanded.filter((workspacePackage) => workspacePackage.scripts[script] !== undefined);
}

/** One package and the command that runs its script. */
export interface PackageRun {
  workspacePackage: WorkspacePackage;
  spec: CommandSpec;
}

/** How a batch of package runs should be started and reported. */
export interface RunSettings {
  /** Packages started at the same time. */
  concurrency: number;
  /** Whether dependents wait for their dependencies rather than only for a free slot. */
  respectsDependencies: boolean;
  /** Whether a failure skips the runs that have not started. */
  bails: boolean;
  /** Whether child output reaches the terminal as it is produced. */
  streams: boolean;
  /** Whether captured output is printed for a run that succeeded. */
  showsPassing: boolean;
  /** Milliseconds before a run is killed, or `undefined` to wait indefinitely. */
  timeoutMs?: number;
}

function toSummaryRow(workspacePackage: WorkspacePackage, outcome: Awaited<ReturnType<typeof execute>>): SummaryRow {
  if (outcome.didTimeOut) {
    return { detail: formatDuration(outcome.durationMs), label: workspacePackage.name, status: "timed-out" };
  }
  return {
    detail: formatDuration(outcome.durationMs),
    label: workspacePackage.name,
    status: outcome.isSuccess ? "passed" : "failed",
  };
}

/**
 * Runs one script across a batch of packages and reports each outcome.
 *
 * Output is captured rather than streamed unless it was asked for, and a captured
 * run is printed only when it failed. A passing package has nothing to say that
 * its summary row does not, and printing it anyway buries the one package that
 * does.
 * @param context Command invocation.
 * @param script Script being run, used in headings.
 * @param runs Packages and the commands to run for them.
 * @param settings Concurrency, ordering, and output behavior.
 * @returns One summary row per run, in input order.
 */
export async function runPackageBatch(
  context: CommandContext,
  script: string,
  runs: readonly PackageRun[],
  settings: RunSettings,
): Promise<SummaryRow[]> {
  const { reporter } = context;
  const rows = new Map<string, SummaryRow>();
  let hasFailure = false;

  const runOne = async ({ spec, workspacePackage }: PackageRun): Promise<void> => {
    if (hasFailure && settings.bails) {
      rows.set(workspacePackage.name, {
        detail: "not reached",
        label: workspacePackage.name,
        status: "skipped",
      });
      return;
    }
    if (settings.streams) {
      reporter.blank();
      reporter.step(`${workspacePackage.name} › ${script}`);
    }
    const outcome = await execute(spec, {
      stdio: settings.streams ? "inherit" : "pipe",
      timeoutMs: settings.timeoutMs,
    });
    if (!outcome.isSuccess) {
      hasFailure = true;
    }
    if (!settings.streams && (settings.showsPassing || !outcome.isSuccess)) {
      reporter.blank();
      reporter.step(`${workspacePackage.name} › ${script}`);
      reporter.info(outcome.output?.trimEnd() ?? "");
    }
    rows.set(workspacePackage.name, toSummaryRow(workspacePackage, outcome));
  };

  if (settings.respectsDependencies) {
    const byName = new Map(runs.map((run) => [run.workspacePackage.name, run]));
    // Only a dependent has to wait for a dependency; everything in one level is
    // independent of everything else in it, so the level runs at full width.
    const levels = groupByDependencyLevel(runs.map(({ workspacePackage }) => workspacePackage));
    await mapSeries(levels, async (level) => {
      const levelRuns = level.map((workspacePackage) => byName.get(workspacePackage.name) as PackageRun);
      await mapConcurrent(levelRuns, Math.max(1, Math.min(settings.concurrency, levelRuns.length)), runOne);
    });
  } else {
    await mapConcurrent(runs, Math.max(1, Math.min(settings.concurrency, runs.length)), runOne);
  }

  return runs.map(({ workspacePackage }) => rows.get(workspacePackage.name) as SummaryRow);
}

/**
 * Builds the runs that produce what a command's script needs before it starts.
 *
 * The selection is expanded to the workspace dependencies of the packages that
 * were asked for, because a package cannot type-check or test against a
 * dependency that has not been built.
 * @param context Command invocation.
 * @param prerequisite Script that must succeed first, normally `build`.
 * @param targets Packages the command was asked to act on.
 * @param root Absolute repository root.
 * @returns Runs in dependency order, empty when `--no-build` was passed.
 */
export function buildPrerequisiteRuns(
  context: CommandContext,
  prerequisite: string,
  targets: readonly PackageSelection[],
  root: string,
): PackageRun[] {
  if (!context.options.shouldBuild) {
    return [];
  }
  return collectScriptPackages(context, targets, prerequisite).map<PackageRun>((workspacePackage) => ({
    spec: buildScriptSpec(workspacePackage, prerequisite, [], root),
    workspacePackage,
  }));
}

/**
 * Runs a prerequisite batch and reports it when it fails.
 *
 * A failure ends the command: the script the prerequisite feeds would run
 * against missing or stale output, and reporting that as a second failure only
 * hides the first one.
 * @param context Command invocation.
 * @param prerequisite Script being run, used in headings and messages.
 * @param script Script the prerequisite was run for, named in the failure message.
 * @param runs Prerequisite runs, normally from {@link buildPrerequisiteRuns}.
 * @param settings Concurrency and output behavior of the surrounding command.
 * @returns `true` when every run passed or there was nothing to run.
 */
export async function runPrerequisiteRuns(
  context: CommandContext,
  prerequisite: string,
  script: string,
  runs: readonly PackageRun[],
  settings: RunSettings,
): Promise<boolean> {
  const { reporter } = context;

  if (runs.length === 0) {
    return true;
  }
  // A captured build says nothing until it ends, and a workspace build is the
  // longest silence in a run. Naming the step keeps it legible while it lasts.
  if (!settings.streams) {
    reporter.blank();
    reporter.step(`${prerequisite} › ${runs.length} package(s)`);
  }
  const rows = await runPackageBatch(context, prerequisite, runs, {
    ...settings,
    // A build feeds every run after it, so there is nothing to gain from
    // starting the rest once one has failed.
    bails: true,
    respectsDependencies: true,
  });
  if (!rows.some(({ status }) => status !== "passed" && status !== "skipped")) {
    return true;
  }

  reporter.blank();
  // Only what broke is named. The packages the failure stopped are counted
  // rather than listed: there is one line per package and none of them says
  // anything the count does not.
  reporter.summarize(
    context.options.isVerbose ? rows : rows.filter(({ status }) => status !== "passed" && status !== "skipped"),
  );
  reporter.tally(rows);
  reporter.blank();
  reporter.error(`\`${prerequisite}\` failed; \`${script}\` did not run.`);
  return false;
}

/**
 * Creates a command that runs one package script across the selected packages.
 *
 * Prerequisite scripts run first so package manifests no longer need to chain
 * `build` into `test` or `typecheck` themselves. Packages without the script are
 * skipped rather than failing, matching `--if-present` behavior.
 * @param options Script name, prerequisites, and forwarding behavior.
 * @returns Command definition ready for registration.
 */
export function createScriptCommand(options: ScriptCommandOptions): CommandDefinition {
  const script = options.script ?? options.name;

  return {
    name: options.name,
    run: async (context) => runScriptCommand(context, options, script),
    summary: options.summary,
    usage: `hub ${options.name} [targets...] [options] [-- tool arguments]`,
  };
}

async function runScriptCommand(
  context: CommandContext,
  options: ScriptCommandOptions,
  script: string,
): Promise<number> {
  const { reporter, selection } = context;
  const root = context.workspace.root;
  const runnable = selection.targets.filter(
    ({ package: workspacePackage }) => workspacePackage.scripts[script] !== undefined,
  );
  const skipped = selection.targets.length - runnable.length;

  if (selection.unownedPaths.length > 0) {
    reporter.warn(
      `\`hub ${options.name}\` runs package scripts and ignored ${selection.unownedPaths.length} path(s) outside every package.`,
    );
  }
  if (runnable.length === 0) {
    reporter.warn(`No selected package defines a "${script}" script.`);
    return EXIT_SUCCESS;
  }
  if (options.isInteractive === true && runnable.length > 1) {
    const names = runnable.map(({ package: workspacePackage }) => workspacePackage.name).join(", ");
    reporter.error(`\`hub ${options.name}\` runs one package at a time, but ${runnable.length} matched: ${names}.`);
    return EXIT_FAILURE;
  }

  const pathsByName = new Map(runnable.map(({ package: workspacePackage, paths }) => [workspacePackage.name, paths]));
  const runPackages =
    options.includesDependencies === true
      ? collectScriptPackages(context, runnable, script)
      : runnable.map(({ package: workspacePackage }) => workspacePackage);
  const runs = runPackages.map<PackageRun>((workspacePackage) => ({
    spec: buildScriptSpec(
      workspacePackage,
      script,
      [
        ...(options.forwardsPaths === true ? (pathsByName.get(workspacePackage.name) ?? []) : []),
        ...context.passthrough,
      ],
      root,
    ),
    workspacePackage,
  }));

  const prerequisite = options.prerequisite;
  const prerequisiteRuns =
    prerequisite === undefined ? [] : buildPrerequisiteRuns(context, prerequisite, runnable, root);
  // Preparation runs ahead of the builds: it is the cheaper of the two, and a
  // missing browser should not be reported only after a build has finished.
  const prepareSpecs =
    options.prepare === undefined
      ? []
      : await options.prepare(
          context,
          runnable.map(({ package: workspacePackage }) => workspacePackage),
        );

  if (context.options.isDryRun) {
    reporter.step(`Would run \`${script}\` in ${runs.length} package(s)`);
    for (const spec of [
      ...prepareSpecs,
      ...prerequisiteRuns.map(({ spec }) => spec),
      ...runs.map(({ spec }) => spec),
    ]) {
      reporter.detail(`  ${spec.cwd}: ${formatCommand(spec)}`);
    }
    return EXIT_SUCCESS;
  }

  const isInteractive = options.isInteractive === true;
  const isVerbose = context.options.isVerbose;
  const concurrency = isInteractive ? 1 : context.options.concurrency;
  const timeoutMs = isInteractive ? undefined : context.options.timeoutMs;
  const settings: RunSettings = {
    bails: context.options.shouldBail,
    concurrency,
    respectsDependencies: options.includesDependencies === true,
    // Streaming interleaves two packages into one unreadable transcript, so it is
    // only ever done when a single package holds the terminal.
    showsPassing: isInteractive || isVerbose,
    streams: isInteractive || (isVerbose && concurrency === 1),
    timeoutMs,
  };

  if (prepareSpecs.length > 0 && !settings.streams) {
    // Installing a browser is the one supporting step that can run for minutes,
    // and it says nothing while it does. Naming it keeps the wait explained.
    reporter.blank();
    reporter.step(`preparing › ${prepareSpecs.length} step(s)`);
  }
  const prepareFailure = await runSupportingCommands(context, prepareSpecs, settings);
  if (prepareFailure !== undefined) {
    reporter.error(prepareFailure);
    return EXIT_FAILURE;
  }

  if (!(await runPrerequisiteRuns(context, prerequisite ?? "", script, prerequisiteRuns, settings))) {
    return EXIT_FAILURE;
  }

  if (!settings.streams) {
    reporter.blank();
    reporter.step(`${script} › ${runs.length} package(s)`);
  }
  const startedAt = performance.now();
  const rows = await runPackageBatch(context, script, runs, settings);
  const hasFailure = rows.some(({ status }) => status === "failed" || status === "timed-out");

  reporter.blank();
  // A passing run is reported by its tally; the table is what a failure needs, so
  // it lists only the packages that did not pass.
  if (hasFailure || isVerbose) {
    reporter.summarize(isVerbose ? rows : rows.filter(({ status }) => status !== "passed"));
  }
  reporter.tally(rows, performance.now() - startedAt);
  if (skipped > 0) {
    reporter.detail(`  ${skipped} package(s) without a "${script}" script were skipped.`);
  }
  return hasFailure ? EXIT_FAILURE : EXIT_SUCCESS;
}

/**
 * Runs the commands a script depends on, stopping at the first failure.
 *
 * Later commands are abandoned rather than run: the script they support is not
 * going to run either way, so continuing only delays the message that explains
 * why.
 * @param context Command invocation.
 * @param specs Commands to run in order.
 * @returns Message describing the first failure, or `undefined` when all succeeded.
 */
async function runSupportingCommands(
  context: CommandContext,
  specs: readonly CommandSpec[],
  settings: RunSettings,
): Promise<string | undefined> {
  let failure: string | undefined;

  await mapSeries(specs, async (spec) => {
    if (failure !== undefined) {
      return;
    }
    const outcome = await execute(spec, {
      stdio: settings.streams ? "inherit" : "pipe",
      timeoutMs: settings.timeoutMs,
    });
    // A supporting step is reported on the same terms as the packages it runs
    // for: silent when it worked and nobody asked, printed when it did not.
    if (!settings.streams && (settings.showsPassing || !outcome.isSuccess)) {
      context.reporter.blank();
      context.reporter.info(outcome.output?.trimEnd() ?? "");
    }
    if (!outcome.isSuccess) {
      failure = `Required step \`${formatCommand(spec)}\` failed in ${spec.cwd}.`;
    }
  });
  return failure;
}
