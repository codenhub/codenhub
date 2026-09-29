import { execute } from "../process/execute.ts";

const DEFAULT_BASE_REF = "main";
const STATUS_PREFIX_LENGTH = 3;
const MOVED_STATUSES = new Set(["R", "C"]);

async function readGitOutput(root: string, args: readonly string[]): Promise<string | undefined> {
  const outcome = await execute({ args, command: "git", cwd: root }, { stdio: "pipe" });
  // Standard output alone: a warning git writes to stderr is not a path.
  return outcome.isSuccess ? (outcome.stdout ?? "") : undefined;
}

/**
 * Reads the paths out of `git status --porcelain -z`.
 *
 * NUL-separated output is used because it is the only form git never quotes or
 * escapes: a path with a space, a quote, or a non-ASCII character arrives as
 * written. A rename or copy entry is followed by its original path as an entry
 * of its own, which is skipped so only the path now in the tree is reported.
 * @param output Raw `git status --porcelain -z` output.
 * @returns Paths in the order git listed them.
 */
export function parsePorcelainPaths(output: string): string[] {
  const entries = output.split("\0");
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] as string;
    if (entry.length <= STATUS_PREFIX_LENGTH) {
      continue;
    }
    paths.push(entry.slice(STATUS_PREFIX_LENGTH));
    if (MOVED_STATUSES.has(entry[0] as string) || MOVED_STATUSES.has(entry[1] as string)) {
      index += 1;
    }
  }
  return paths;
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
    readGitOutput(root, ["diff", "--name-only", "-z", "--merge-base", baseRef, "HEAD"]),
    readGitOutput(root, ["status", "--porcelain", "-z", "--untracked-files=all"]),
  ]);

  const paths = [...(committed ?? "").split("\0"), ...parsePorcelainPaths(workingTree ?? "")].filter(
    (path) => path !== "",
  );

  return [...new Set(paths.map((path) => path.replaceAll("\\", "/")))].sort();
}
