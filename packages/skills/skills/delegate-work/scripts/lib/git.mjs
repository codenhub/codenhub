import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { canonical } from "./glob.mjs";

const IDENTITY = {
  GIT_AUTHOR_NAME: "snapshot",
  GIT_AUTHOR_EMAIL: "snapshot@localhost",
  GIT_COMMITTER_NAME: "snapshot",
  GIT_COMMITTER_EMAIL: "snapshot@localhost",
};

// Every git call sees files byte for byte: no autocrlf/eol conversion and no
// .gitattributes filters (attributes are read from the empty tree). Restores
// must write back the user's bytes; with autocrlf=true, the Git for Windows
// default, git's normalized form turns CRLF files into LF. Needs git 2.41+.
const EMPTY_TREE = {
  sha1: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
  sha256: "6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321",
};
const formats = new Map();

/** Env that gives git (and processes that run git) the byte-exact view of cwd's repo. */
export function bytesEnv(cwd) {
  if (!formats.has(cwd)) {
    const r = spawnSync("git", ["rev-parse", "--show-object-format"], { cwd, windowsHide: true });
    formats.set(cwd, r.status === 0 ? r.stdout.toString().trim() : null);
  }
  const tree = EMPTY_TREE[formats.get(cwd)];
  return {
    ...(tree ? { GIT_ATTR_SOURCE: tree } : {}),
    GIT_CONFIG_COUNT: "3",
    GIT_CONFIG_KEY_0: "core.autocrlf",
    GIT_CONFIG_VALUE_0: "false",
    GIT_CONFIG_KEY_1: "core.eol",
    GIT_CONFIG_VALUE_1: "lf",
    GIT_CONFIG_KEY_2: "core.safecrlf",
    GIT_CONFIG_VALUE_2: "false",
  };
}

export function git(args, { cwd, env, input, allowFail = false, raw = false } = {}) {
  const r = spawnSync("git", args, {
    cwd,
    env: { ...process.env, ...(cwd ? bytesEnv(cwd) : {}), ...env },
    input,
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr?.toString().trim()}`);
  }
  if (raw) {
    return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr?.toString() ?? "" };
  }
  return allowFail
    ? { ok: r.status === 0, stdout: r.stdout?.toString().trim() ?? "", stderr: r.stderr?.toString() ?? "" }
    : r.stdout.toString().trim();
}

/** null when git is usable, otherwise why not. Older git ignores GIT_ATTR_SOURCE silently. */
export function gitProblem() {
  const r = spawnSync("git", ["--version"], { windowsHide: true });
  const m = r.stdout?.toString().match(/(\d+)\.(\d+)/);
  if (!m) {
    return "git not found";
  }
  return +m[1] > 2 || (+m[1] === 2 && +m[2] >= 41) ? null : `git ${m[0]} is too old; 2.41+ required`;
}

export const repoRoot = (cwd) => canonical(path.resolve(git(["rev-parse", "--show-toplevel"], { cwd })));

const hasHead = (cwd) => git(["rev-parse", "--verify", "-q", "HEAD"], { cwd, allowFail: true }).ok;

/**
 * Tree of the working directory as it is now (tracked + untracked, respecting
 * .gitignore), built in a throwaway index so the real index is never touched.
 */
export function workingTree(cwd, tmpIndex) {
  const env = { GIT_INDEX_FILE: tmpIndex };
  try {
    if (hasHead(cwd)) {
      git(["read-tree", "HEAD"], { cwd, env });
    } else {
      git(["read-tree", "--empty"], { cwd, env });
    }
    git(["add", "-A", "--", "."], { cwd, env });
    return git(["write-tree"], { cwd, env });
  } finally {
    fs.rmSync(tmpIndex, { force: true });
  }
}

/** Unreferenced commit of the current working state. Never gets a ref; git gc drops it. */
export function snapshot(cwd, tmpIndex) {
  const tree = workingTree(cwd, tmpIndex);
  const parent = hasHead(cwd) ? ["-p", "HEAD"] : [];
  return git(["commit-tree", tree, ...parent, "-m", "snapshot"], { cwd, env: IDENTITY });
}

export function numstat(a, b, cwd) {
  const { stdout } = git(["diff", "--numstat", "-z", "--no-renames", a, b], { cwd, raw: true });
  const out = [];
  for (const rec of stdout.toString("utf8").split("\0")) {
    const m = rec.match(/^(\S+)\t(\S+)\t(.+)$/s);
    if (m) {
      out.push({ path: m[3], added: m[1] === "-" ? null : +m[1], removed: m[2] === "-" ? null : +m[2] });
    }
  }
  return out;
}

export const patch = (a, b, cwd) => git(["diff", "--binary", "--no-renames", a, b], { cwd, raw: true }).stdout;

export function blob(ref, file, cwd) {
  const r = git(["cat-file", "blob", `${ref}:${file}`], { cwd, raw: true, allowFail: true });
  return r.ok ? r.stdout : null;
}

export function blobId(ref, file, cwd) {
  const r = git(["rev-parse", "-q", "--verify", `${ref}:${file}`], { cwd, allowFail: true });
  return r.ok ? r.stdout : null;
}

export function fileId(cwd, file) {
  if (!fs.existsSync(path.join(cwd, file))) {
    return null;
  }
  return git(["hash-object", "--", file], { cwd });
}

export function listFiles(cwd) {
  const { stdout } = git(["ls-files", "-co", "--exclude-standard", "-z"], { cwd, raw: true });
  return stdout.toString("utf8").split("\0").filter(Boolean);
}

export function addWorktree(root, dir, commit) {
  git(["worktree", "add", "--detach", dir, commit], { cwd: root });
}
