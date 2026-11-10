import type { WorkspacePackage } from "./discover.ts";

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
 * @throws When `codenhub.tools` is not an object, or `timeout` is not a positive number of seconds that stays finite in milliseconds.
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
  // Validated after scaling, as the `--timeout` flag is: a value that overflows
  // the conversion would become `Infinity`, and a timer set to that fires at once.
  const milliseconds = typeof seconds === "number" ? seconds * 1000 : Number.NaN;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error(
      `Invalid codenhub.tools.timeout in ${workspacePackage.name}: expected a positive number of seconds, received ${JSON.stringify(seconds)}.`,
    );
  }
  return milliseconds;
}
