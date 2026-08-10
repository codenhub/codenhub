import { mapConcurrent } from "../process/concurrency.ts";
import { formatCommand, type CommandSpec, execute } from "../process/execute.ts";
import { formatDuration, type SummaryRow } from "../reporting/reporter.ts";
import { orderByDependencies, withWorkspaceDependencies } from "../workspace/dependency-order.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { PackageSelection } from "../workspace/select-packages.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

const PACKAGE_MANAGER = "pnpm";

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

function buildSpec(workspacePackage: WorkspacePackage, script: string, args: readonly string[]): CommandSpec {
  return { args: ["run", script, ...args], command: PACKAGE_MANAGER, cwd: workspacePackage.directory };
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

interface PackageRun {
  workspacePackage: WorkspacePackage;
  spec: CommandSpec;
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
    spec: buildSpec(workspacePackage, script, [
      ...(options.forwardsPaths === true ? (pathsByName.get(workspacePackage.name) ?? []) : []),
      ...context.passthrough,
    ]),
    workspacePackage,
  }));

  const prerequisiteSpecs =
    options.prerequisite !== undefined && context.options.shouldBuild
      ? collectScriptPackages(context, runnable, options.prerequisite).map((workspacePackage) =>
          buildSpec(workspacePackage, options.prerequisite as string, []),
        )
      : [];
  // Preparation runs ahead of the builds: it is the cheaper of the two, and a
  // missing browser should not be reported only after a build has finished.
  const supportingSpecs = [
    ...(options.prepare === undefined
      ? []
      : await options.prepare(
          context,
          runnable.map(({ package: workspacePackage }) => workspacePackage),
        )),
    ...prerequisiteSpecs,
  ];

  if (context.options.isDryRun) {
    reporter.step(`Would run \`${script}\` in ${runs.length} package(s)`);
    for (const spec of [...supportingSpecs, ...runs.map(({ spec }) => spec)]) {
      reporter.detail(`  ${spec.cwd}: ${formatCommand(spec)}`);
    }
    return EXIT_SUCCESS;
  }

  const isInteractive = options.isInteractive === true;
  // `--parallel` is ignored once the run is ordered by dependencies: running a
  // dependent alongside its dependency is the very race the ordering prevents.
  const isSequential = isInteractive || options.includesDependencies === true;
  const concurrency = isSequential ? 1 : Math.min(context.options.concurrency, runs.length);
  const stdio = concurrency === 1 ? "inherit" : "pipe";
  const timeoutMs = isInteractive ? undefined : context.options.timeoutMs;

  const supportingFailure = await runSupportingCommands(context, supportingSpecs);
  if (supportingFailure !== undefined) {
    reporter.error(supportingFailure);
    return EXIT_FAILURE;
  }

  let hasFailure = false;
  const rows = await mapConcurrent(runs, concurrency, async ({ spec, workspacePackage }) => {
    if (hasFailure && context.options.shouldBail) {
      return { label: workspacePackage.name, status: "skipped" } satisfies SummaryRow;
    }
    if (stdio === "inherit") {
      reporter.blank();
      reporter.step(`${workspacePackage.name} › ${script}`);
    }
    const outcome = await execute(spec, { stdio, timeoutMs });
    if (stdio === "pipe") {
      reporter.blank();
      reporter.step(`${workspacePackage.name} › ${script}`);
      reporter.info(outcome.output?.trimEnd() ?? "");
    }
    if (!outcome.isSuccess) {
      hasFailure = true;
    }
    return toSummaryRow(workspacePackage, outcome);
  });

  reporter.blank();
  reporter.summarize(rows);
  if (skipped > 0) {
    reporter.detail(`  ${skipped} package(s) without a "${script}" script were skipped.`);
  }
  return hasFailure ? EXIT_FAILURE : EXIT_SUCCESS;
}

async function runSupportingCommands(
  context: CommandContext,
  specs: readonly CommandSpec[],
): Promise<string | undefined> {
  const outcomes = await mapConcurrent(specs, 1, async (spec) => {
    const outcome = await execute(spec, { stdio: "pipe", timeoutMs: context.options.timeoutMs });
    return { outcome, spec };
  });
  const failure = outcomes.find(({ outcome }) => !outcome.isSuccess);
  if (failure === undefined) {
    return undefined;
  }
  context.reporter.blank();
  context.reporter.info(failure.outcome.output?.trimEnd() ?? "");
  return `Required step \`${formatCommand(failure.spec)}\` failed in ${failure.spec.cwd}.`;
}
