import { execute } from "../process/execute.ts";

/** Runs a git command and returns its outcome. Injected by tests. */
export type GitContentReader = (
  args: readonly string[],
  cwd: string,
) => Promise<{ isSuccess: boolean; stdout: string }>;

const runGit: GitContentReader = async (args, cwd) => {
  const outcome = await execute({ args, command: "git", cwd }, { stdio: "pipe" });
  return { isSuccess: outcome.isSuccess, stdout: outcome.stdout ?? "" };
};

/**
 * Lists every file git tracked under a path at a given ref.
 *
 * A `treePath` matching nothing at `ref` is a legitimate result — `git
 * ls-tree` exits successfully with empty output for that, which is exactly
 * how a package with no docs yet at its latest tag is told apart from one
 * with docs. The ref itself being unreadable is different and throws:
 * treating it the same as "no docs at this tag" would fall back to live,
 * unreleased content for a package that has, in fact, published.
 * @param cwd Repository directory to run `git` in.
 * @param ref Tag or commit to read from.
 * @param treePath Repository-relative POSIX path to list, such as `packages/error/docs`.
 * @param git Git runner, defaulting to a real `git ls-tree`.
 * @returns Repository-relative POSIX paths of every file under `treePath` at `ref`.
 * @throws When `ref` cannot be read at all.
 */
export async function listFilesAtRef(
  cwd: string,
  ref: string,
  treePath: string,
  git: GitContentReader = runGit,
): Promise<string[]> {
  const outcome = await git(["ls-tree", "-r", "--name-only", ref, "--", treePath], cwd);
  if (!outcome.isSuccess) {
    throw new Error(`Could not read ${ref} in ${cwd}.`);
  }
  return outcome.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * Reads one file's content as it was committed at a given ref.
 * @param cwd Repository directory to run `git` in.
 * @param ref Tag or commit to read from.
 * @param filePath Repository-relative POSIX path to the file.
 * @param git Git runner, defaulting to a real `git show`.
 * @returns The file's content, or `undefined` when it cannot be read at that ref.
 */
export async function readFileAtRef(
  cwd: string,
  ref: string,
  filePath: string,
  git: GitContentReader = runGit,
): Promise<string | undefined> {
  const outcome = await git(["show", `${ref}:${filePath}`], cwd);
  return outcome.isSuccess ? outcome.stdout : undefined;
}
