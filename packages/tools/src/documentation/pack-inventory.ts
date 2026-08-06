import { execute } from "../process/execute.ts";

/**
 * Runs a command and returns its standard output.
 *
 * Injected by tests so pack inventories can be exercised without npm.
 */
export type CommandRunner = (command: string, args: readonly string[], cwd: string) => Promise<{ stdout: string }>;

const runPackCommand: CommandRunner = async (command, args, cwd) => {
  const outcome = await execute({ args, command, cwd }, { stdio: "pipe" });
  if (!outcome.isSuccess) {
    throw new Error(`\`${command} ${args.join(" ")}\` failed in ${cwd}: ${outcome.output?.trim() ?? ""}`);
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
 * @param packageRoot Absolute package directory.
 * @param runCommand Command runner, defaulting to `npm pack --dry-run --json`.
 * @returns Package-relative POSIX paths included in the tarball.
 * @throws When npm fails or its output is not the expected JSON shape.
 */
export async function readNpmPackInventory(
  packageRoot: string,
  runCommand: CommandRunner = runPackCommand,
): Promise<Set<string>> {
  const result = await runCommand("npm", ["pack", "--dry-run", "--json"], packageRoot);
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
