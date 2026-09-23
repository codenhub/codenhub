import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { execute } from "../process/execute.ts";

/** One git invocation a tree materialization needs. */
export interface GitTreeInvocation {
  /** Arguments passed to `git`. */
  args: readonly string[];
  /** Repository directory to run `git` in. */
  cwd: string;
  /** Extra environment variables layered over this process's environment. */
  env?: Readonly<Record<string, string>>;
}

/** Runs a git command and returns its outcome. Injected by tests. */
export type GitTreeRunner = (invocation: GitTreeInvocation) => Promise<{ isSuccess: boolean; stdout: string }>;

const runGit: GitTreeRunner = async ({ args, cwd, env }) => {
  const outcome = await execute(
    { args, command: "git", cwd, env: env === undefined ? undefined : { ...process.env, ...env } },
    { stdio: "pipe" },
  );
  return { isSuccess: outcome.isSuccess, stdout: outcome.stdout ?? "" };
};

/** Which tree to write out, and where. */
export interface MaterializeTreeOptions {
  /** Repository directory to run `git` in. */
  cwd: string;
  /** Tag or commit to read from. */
  ref: string;
  /** Repository-relative POSIX directory to write out, such as `packages/error`. */
  treePath: string;
  /** Absolute directory the tree's files are written into, mirroring their paths under `treePath`. */
  destination: string;
}

/**
 * Writes every file git tracked under a directory at a given ref into another directory.
 *
 * The files come out byte-for-byte as committed, binary ones included, with the
 * repository's own attributes applied — the same result a checkout of that ref
 * would put on disk. The repository's index and working tree are never touched:
 * the tree is staged into a throwaway index and checked out from there.
 *
 * `treePath` not existing at `ref` is a legitimate result and returns `false`,
 * which is how a package that did not exist yet at a ref is told apart from one
 * that did. The ref itself being unreadable is different and throws: a caller
 * that treated it the same as "nothing here" could not tell a missing release
 * from a broken repository.
 * @param options Repository, ref, directory, and destination.
 * @param git Git runner, defaulting to real `git` processes.
 * @returns Whether `treePath` existed at `ref` and was written out.
 * @throws When `ref` cannot be read, `treePath` names a file rather than a directory, or git fails to write the tree.
 */
export async function materializeTreeAtRef(
  options: MaterializeTreeOptions,
  git: GitTreeRunner = runGit,
): Promise<boolean> {
  const { cwd, destination, ref, treePath } = options;
  const commit = await git({ args: ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd });
  if (!commit.isSuccess) {
    throw new Error(`Could not read ${ref} in ${cwd}.`);
  }
  const treeish = `${ref}:${treePath}`;
  const objectType = await git({ args: ["cat-file", "-t", treeish], cwd });
  if (!objectType.isSuccess) {
    return false;
  }
  if (objectType.stdout.trim() !== "tree") {
    throw new Error(`${treePath} at ${ref} is not a directory.`);
  }

  const indexDirectory = await mkdtemp(path.join(tmpdir(), "codenhub-tree-"));
  try {
    const env = { GIT_INDEX_FILE: path.join(indexDirectory, "index") };
    const staged = await git({ args: ["read-tree", treeish], cwd, env });
    if (!staged.isSuccess) {
      throw new Error(`Could not stage ${treeish} in ${cwd}.`);
    }
    // `--prefix` is a string prefix, not a directory argument, so the trailing
    // separator is what places files inside `destination` rather than beside it.
    const prefix = `${destination.replaceAll("\\", "/").replace(/\/$/, "")}/`;
    const written = await git({ args: ["checkout-index", "--all", "--force", `--prefix=${prefix}`], cwd, env });
    if (!written.isSuccess) {
      throw new Error(`Could not write ${treeish} to ${destination}.`);
    }
    return true;
  } finally {
    await rm(indexDirectory, { force: true, recursive: true });
  }
}
