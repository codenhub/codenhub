import { execute } from "../process/execute.ts";

/** A child process a pack inventory needs to run. */
export interface PackInvocation {
  /** Executable name resolved through `PATH`. */
  command: string;
  /** Arguments passed to the executable. */
  args: readonly string[];
  /** Absolute working directory. */
  cwd: string;
  /** Milliseconds before the process is killed, or `undefined` to wait indefinitely. */
  timeoutMs?: number;
}

/**
 * Runs a command and returns its standard output.
 *
 * Injected by tests so pack inventories can be exercised without npm.
 */
export type CommandRunner = (invocation: PackInvocation) => Promise<{ stdout: string }>;

/** How a package's publishable file list should be read. */
export interface PackInventoryOptions {
  /** Absolute package directory. */
  packageRoot: string;
  /** Command runner, defaulting to `npm pack`. */
  runCommand?: CommandRunner;
  /** Milliseconds before npm is killed, or `undefined` to wait indefinitely. */
  timeoutMs?: number;
}

// `--ignore-scripts` keeps the dry run from triggering packaging lifecycle
// scripts, which would build the package a second time for a read-only check.
const PACK_ARGUMENTS = ["pack", "--dry-run", "--ignore-scripts", "--json"];

const runPackCommand: CommandRunner = async (invocation) => {
  const outcome = await execute(invocation, { stdio: "pipe", timeoutMs: invocation.timeoutMs });
  if (!outcome.isSuccess) {
    throw new Error(
      `\`${invocation.command} ${invocation.args.join(" ")}\` failed in ${invocation.cwd}: ${outcome.output?.trim() ?? ""}`,
    );
  }
  return { stdout: outcome.stdout ?? "" };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Lists the files npm would publish for a package.
 *
 * The documentation spec requires real npm output rather than an approximation
 * of its inclusion rules, so this always shells out.
 * @param options Package directory, command runner, and timeout.
 * @returns Package-relative POSIX paths included in the tarball.
 * @throws When npm fails or its output is not the expected JSON shape.
 */
export async function readNpmPackInventory(options: PackInventoryOptions): Promise<Set<string>> {
  const { packageRoot, runCommand = runPackCommand, timeoutMs } = options;
  const result = await runCommand({ args: PACK_ARGUMENTS, command: "npm", cwd: packageRoot, timeoutMs });
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Invalid npm pack inventory for ${packageRoot}: output is not JSON.`);
  }
  const entry = Array.isArray(parsed) ? parsed[0] : undefined;
  if (!isRecord(entry) || !Array.isArray(entry.files)) {
    throw new Error(`Invalid npm pack inventory for ${packageRoot}: expected a files array.`);
  }
  const files = entry.files.map((file) => (isRecord(file) ? file.path : undefined));
  if (files.some((filePath) => typeof filePath !== "string")) {
    throw new Error(`Invalid npm pack inventory for ${packageRoot}: expected file paths.`);
  }
  return new Set((files as string[]).map((filePath) => filePath.replaceAll("\\", "/")));
}
