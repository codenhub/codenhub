import fs from "node:fs";
import path from "node:path";

import * as G from "./git.mjs";

// Worktrees get the repository's dependency folders as links (junctions on
// Windows). Deleting through a link deletes the user's real folder, and
// `git worktree remove` does exactly that on Windows. Everything that removes
// a worktree or a run directory goes through this module.

const WIN = process.platform === "win32";

export function linkDeps(root, wt, dirs) {
  const linked = [];
  for (const d of dirs) {
    const target = path.join(root, d);
    const link = path.join(wt, d);
    if (!fs.existsSync(path.dirname(link)) || fs.existsSync(link)) {
      continue;
    }
    fs.symlinkSync(target, link, WIN ? "junction" : "dir");
    linked.push(d);
  }
  return linked;
}

/** Remove only the link itself. Throws if it can't, so callers stop before deleting anything. */
export function unlinkSafe(p) {
  try {
    if (!fs.lstatSync(p).isSymbolicLink()) {
      return;
    }
  } catch {
    return;
  }
  try {
    fs.unlinkSync(p);
  } catch {
    fs.rmdirSync(p);
  }
}

/** Unlink every symlink and junction under dir, never following one. */
export function stripLinks(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      unlinkSafe(p);
    } else if (e.isDirectory()) {
      stripLinks(p);
    }
  }
}

/** Delete a directory that may contain links. fs.rmSync doesn't follow links; stripping first is the second guard. */
export function removeDirSafe(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  stripLinks(dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/** The repository a linked worktree belongs to, read from its .git file. */
function worktreeRepo(wt) {
  try {
    const gitdir = fs
      .readFileSync(path.join(wt, ".git"), "utf8")
      .match(/^gitdir:\s*(.+)$/m)?.[1]
      .trim();
    return gitdir ? path.resolve(wt, gitdir, "..", "..") : null;
  } catch {
    return null;
  }
}

/**
 * Remove a run's worktree without trusting its recorded links (a crash can
 * lose them): strip every link, delete the files ourselves, then let git
 * forget the worktree.
 */
export function removeWorktree(wt, root) {
  if (!wt || !fs.existsSync(wt)) {
    return;
  }
  const gitDir = worktreeRepo(wt);
  removeDirSafe(wt);
  if (root && fs.existsSync(root)) {
    G.git(["worktree", "prune"], { cwd: root, allowFail: true });
  } else if (gitDir) {
    G.git(["--git-dir", gitDir, "worktree", "prune"], { allowFail: true });
  }
}
