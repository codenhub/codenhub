import { formatDuration, type SummaryRow } from "../reporting/reporter.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

/**
 * The commands a verification run performs, in order.
 *
 * Formatting and linting come first because they are the cheapest and the most
 * likely to fail on a fresh change, and `check` comes last because a compliance
 * report is only worth reading once the code it describes compiles and passes.
 * Browser tests follow the unit tests for the same reason: they are the slowest
 * step, and a unit failure answers the same question far sooner.
 */
const VERIFY_STEPS: readonly string[] = ["format", "lint", "typecheck", "test", "test:browser", "check"];

interface StepOutcome {
  name: string;
  exitCode: number;
  durationMs: number;
}

/** Resolves a step name to the command that runs it, injected by tests. */
export type CommandResolver = (name: string) => CommandDefinition;

async function runSteps(
  context: CommandContext,
  resolveCommand: CommandResolver,
  steps: readonly string[],
): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = [];

  async function runFrom(index: number): Promise<void> {
    const name = steps[index];
    if (name === undefined) {
      return;
    }
    const startedAt = performance.now();
    context.reporter.blank();
    context.reporter.step(`verify › ${name}`);
    // Tool arguments are not forwarded: the steps run different executables, so
    // no argument could mean the same thing to all of them.
    const exitCode = await resolveCommand(name).run({ ...context, passthrough: [] });
    outcomes.push({ durationMs: performance.now() - startedAt, exitCode, name });
    if (exitCode === EXIT_SUCCESS) {
      await runFrom(index + 1);
    }
  }

  await runFrom(0);
  return outcomes;
}

function toSummaryRow(outcome: StepOutcome): SummaryRow {
  return {
    detail: formatDuration(outcome.durationMs),
    label: outcome.name,
    status: outcome.exitCode === EXIT_SUCCESS ? "passed" : "failed",
  };
}

/**
 * Creates the command that runs every repository check in one pass.
 *
 * Steps run in sequence and stop at the first failure, because each later step
 * is more expensive than the one before it and a formatting failure says nothing
 * about whether the tests would have passed. Steps that never ran are reported
 * as skipped rather than omitted, so the summary always accounts for all of them.
 * @param resolver Resolver for the step commands, defaulting to the command registry.
 * @returns Command definition ready for registration.
 */
export function createVerifyCommand(resolver?: CommandResolver): CommandDefinition {
  return {
    name: "verify",
    run: async (context) => {
      // Importing the registry at module scope would make the two files import
      // each other, and the registry builds its command list while it loads.
      const resolveCommand = resolver ?? (await import("./registry.ts")).resolveCommand;
      const requested = context.options.skippedSteps;
      for (const name of requested.filter((name) => !VERIFY_STEPS.includes(name))) {
        context.reporter.warn(`\`--skip=${name}\` names no verification step; steps are ${VERIFY_STEPS.join(", ")}.`);
      }
      const steps = VERIFY_STEPS.filter((name) => !requested.includes(name));
      const outcomes = await runSteps(context, resolveCommand, steps);
      const unreached = steps.slice(outcomes.length).map<SummaryRow>((name) => ({
        detail: "not reached",
        label: name,
        status: "skipped",
      }));
      // A step left out by request is still listed, so the summary never reads as
      // a full verification when it was not one.
      const excluded = VERIFY_STEPS.filter((name) => requested.includes(name)).map<SummaryRow>((name) => ({
        detail: "skipped by --skip",
        label: name,
        status: "skipped",
      }));

      context.reporter.blank();
      context.reporter.step("verify");
      context.reporter.summarize([...outcomes.map(toSummaryRow), ...unreached, ...excluded]);
      return outcomes.some(({ exitCode }) => exitCode !== EXIT_SUCCESS) ? EXIT_FAILURE : EXIT_SUCCESS;
    },
    summary: "Run formatting, linting, type checking, tests, browser tests, and compliance checks.",
    usage: "hub verify [targets...] [--skip=<step>] [options]",
  };
}
