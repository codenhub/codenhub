import { execFile } from "node:child_process";
import { promisify } from "node:util";

interface CommandResult {
  stdout: string;
}

export type CommandRunner = (command: string, arguments_: string[], cwd: string) => Promise<CommandResult>;

const runExecFile: CommandRunner = async (command, arguments_, cwd) => {
  const isWindowsNpm = process.platform === "win32" && command === "npm";
  const executable = isWindowsNpm ? (process.env.ComSpec ?? "cmd.exe") : command;
  const commandArguments = isWindowsNpm ? ["/d", "/s", "/c", "npm", ...arguments_] : arguments_;
  const result = await promisify(execFile)(executable, commandArguments, { cwd, encoding: "utf8" });
  return { stdout: result.stdout };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readNpmPackInventory(
  packageRoot: string,
  runCommand: CommandRunner = runExecFile,
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
