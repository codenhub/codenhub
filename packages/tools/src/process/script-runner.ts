import { delimiter, dirname, join, resolve } from "node:path";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { quoteForCmd, type CommandSpec } from "./execute.ts";

const PACKAGE_MANAGER = "pnpm";
const BIN_DIRECTORY = join("node_modules", ".bin");
const PATH_VARIABLE = "PATH";
const POSIX_SINGLE_QUOTE = /'/g;
const SHELL_QUOTING_REQUIRED = /[^\w./:=@-]/;

/**
 * Lists the `node_modules/.bin` directories a package script may resolve from.
 *
 * A package manager puts the executables a script names on `PATH` before running
 * it, and running the script without one means reproducing that. The package's
 * own directory comes first, then every parent up to the repository root, which
 * is the same order a package manager and Node's own resolution both use.
 * @param packageDirectory Absolute package directory.
 * @param root Absolute repository root.
 * @returns Absolute bin directories, nearest first.
 */
export function resolveBinDirectories(packageDirectory: string, root: string): string[] {
  const directories: string[] = [];
  // Both paths are normalized before they are compared: a root that reached here
  // with the other platform's separators would never match, and the walk would
  // run past it to the filesystem root.
  const stopAt = resolve(root);
  let current = resolve(packageDirectory);

  for (;;) {
    directories.push(join(current, BIN_DIRECTORY));
    if (current === stopAt) {
      break;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return directories;
}

/**
 * Builds the environment a package script runs in.
 *
 * The `PATH` entry is replaced in place rather than added, because Windows
 * environment variables are case-insensitive and a second `PATH` next to an
 * existing `Path` would be ignored.
 * @param binDirectories Bin directories to prepend, nearest first.
 * @param base Environment to extend. Defaults to this process's environment.
 * @returns Environment with the bin directories ahead of the inherited `PATH`.
 */
export function withBinPath(
  binDirectories: readonly string[],
  base: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string | undefined> {
  const environment = { ...base };
  const existingKey = Object.keys(environment).find((key) => key.toUpperCase() === PATH_VARIABLE) ?? PATH_VARIABLE;
  const inherited = environment[existingKey];
  environment[existingKey] = [...binDirectories, ...(inherited === undefined ? [] : [inherited])].join(delimiter);
  return environment;
}

/**
 * Quotes one argument for the platform shell.
 * @param argument Argument to quote.
 * @returns Argument safe to append to a shell command line.
 */
export function quoteShellArgument(argument: string): string {
  if (argument !== "" && !SHELL_QUOTING_REQUIRED.test(argument)) {
    return argument;
  }
  if (process.platform !== "win32") {
    return `'${argument.replaceAll(POSIX_SINGLE_QUOTE, String.raw`'\''`)}'`;
  }
  return quoteForCmd(argument);
}

/**
 * Reports whether a script has to be run through the package manager.
 *
 * The package manager owns `pre` and `post` hooks, so a script that has one is
 * left to it rather than losing a step to the faster path.
 * @param workspacePackage Package owning the script.
 * @param script Script name.
 * @returns `true` when the package manager must run the script.
 */
export function needsPackageManager(workspacePackage: WorkspacePackage, script: string): boolean {
  return (
    workspacePackage.scripts[`pre${script}`] !== undefined || workspacePackage.scripts[`post${script}`] !== undefined
  );
}

/**
 * Builds the invocation that runs one package script.
 *
 * The script body is handed to the platform shell with the package's bin
 * directories on `PATH`, which is what the package manager would have done. It
 * is skipped for its own sake: `pnpm run` costs roughly two seconds of start-up
 * per call, and a workspace run makes that call once per package per script, so
 * the shim outweighs several of the scripts it starts.
 * @param workspacePackage Package owning the script.
 * @param script Script name.
 * @param args Arguments appended to the script body.
 * @param root Absolute repository root.
 * @returns Command specification ready for {@link execute}.
 */
export function buildScriptSpec(
  workspacePackage: WorkspacePackage,
  script: string,
  args: readonly string[],
  root: string,
): CommandSpec {
  if (needsPackageManager(workspacePackage, script)) {
    return {
      args: ["--silent", "run", script, ...args],
      command: PACKAGE_MANAGER,
      cwd: workspacePackage.directory,
    };
  }

  const body = workspacePackage.scripts[script] as string;
  const line = [body, ...args.map((argument) => quoteShellArgument(argument))].join(" ");
  return {
    args: [],
    command: line,
    cwd: workspacePackage.directory,
    env: withBinPath(resolveBinDirectories(workspacePackage.directory, root)),
    shell: true,
  };
}
