import { execute } from "../process/execute.ts";

const DEFAULT_BASE_REF = "main";
const PORCELAIN_PATH = /^.{3}(?<path>.+)$/;
const RENAME_SEPARATOR = " -> ";

async function readGitOutput(root: string, args: readonly string[]): Promise<string | undefined> {
  const outcome = await execute({ args, command: "git", cwd: root }, { stdio: "pipe" });
  return outcome.isSuccess ? (outcome.output ?? "") : undefined;
}

function parsePorcelainPaths(output: string): string[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => PORCELAIN_PATH.exec(line)?.groups?.path ?? "")
    .map((path) => (path.includes(RENAME_SEPARATOR) ? path.slice(path.indexOf(RENAME_SEPARATOR) + 4) : path))
    .map((path) => path.trim().replaceAll('"', ""))
    .filter((path) => path !== "");
}

/**
 * Lists repository-relative paths that differ from a base ref.
 *
 * Committed differences and the working tree are both included so a run against
 * uncommitted work behaves the same as a run in continuous integration. A
 * missing base ref degrades to working-tree changes only rather than failing.
 * @param root Absolute repository root.
 * @param baseRef Git ref to compare against. Defaults to `main`.
 * @returns Unique POSIX paths, sorted.
 */
export async function findChangedPaths(root: string, baseRef: string = DEFAULT_BASE_REF): Promise<string[]> {
  const [committed, workingTree] = await Promise.all([
    readGitOutput(root, ["diff", "--name-only", "--merge-base", baseRef, "HEAD"]),
    readGitOutput(root, ["status", "--porcelain", "--untracked-files=all"]),
  ]);

  const paths = [
    ...(committed ?? "").split(/\r?\n/).map((line) => line.trim()),
    ...parsePorcelainPaths(workingTree ?? ""),
  ].filter((path) => path !== "");

  return [...new Set(paths.map((path) => path.replaceAll("\\", "/")))].sort();
}
