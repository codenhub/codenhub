import type { WorkspacePackage } from "./discover.ts";

/** The longest delay `setTimeout` honours; a longer one fires after 1 millisecond. */
const MAX_TIMER_MS = 2_147_483_647;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the time limit a package declares for its own script runs.
 *
 * A package whose suite legitimately takes longer than the default, such as one
 * that runs three browser engines in a single local run, says so in its
 * manifest as `codenhub.tools.timeout`, in seconds. Raising `hub`'s default
 * instead would lengthen the wait on a hung run in every other package.
 * @param workspacePackage Package to inspect.
 * @returns The declared limit in milliseconds, or `undefined` when none is declared.
 * @throws When `codenhub.tools` is not an object, or `timeout` is not a positive number of seconds that fits a timer, about 24 days.
 */
export function readPackageTimeoutMs(workspacePackage: WorkspacePackage): number | undefined {
  const codenhub = workspacePackage.manifest.codenhub;
  const tools = isRecord(codenhub) ? codenhub.tools : undefined;
  if (tools === undefined) {
    return undefined;
  }
  if (!isRecord(tools)) {
    throw new Error(`Invalid codenhub.tools in ${workspacePackage.name}: expected an object.`);
  }
  const seconds = tools.timeout;
  if (seconds === undefined) {
    return undefined;
  }
  // Validated after scaling: a value past what a timer holds fires at once
  // rather than never, which is the opposite of a longer limit.
  const milliseconds = typeof seconds === "number" ? seconds * 1000 : Number.NaN;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > MAX_TIMER_MS) {
    throw new Error(
      `Invalid codenhub.tools.timeout in ${workspacePackage.name}: expected a positive number of seconds of at most ${MAX_TIMER_MS / 1000}, received ${JSON.stringify(seconds)}.`,
    );
  }
  return milliseconds;
}
