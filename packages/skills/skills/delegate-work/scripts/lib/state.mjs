import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { canonical } from "./glob.mjs";

/**
 * Not the temp dir: sandboxed workers (Codex) may write anywhere in it, and
 * this holds every run's state and worktree. Not AppData either: packaged
 * Windows apps (the Claude desktop app) get new AppData folders redirected to
 * a private copy, so orchestrators would not share state. The home dir is
 * neither, on every OS.
 */
export const defaultStateDir = () =>
  path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "delegate-work");

let base;
export function baseDir() {
  if (base) {
    return base;
  }
  const dir = process.env.DELEGATE_WORK_STATE || defaultStateDir();
  fs.mkdirSync(dir, { recursive: true });
  // Worktrees live here; harnesses report their files by long path.
  return (base = canonical(dir));
}

export const runDir = (id) => path.join(baseDir(), "runs", id);

export const runsDir = () => path.join(baseDir(), "runs");

export function newRun() {
  fs.mkdirSync(runsDir(), { recursive: true });
  for (;;) {
    const id = crypto.randomBytes(3).toString("hex");
    try {
      fs.mkdirSync(runDir(id));
      return id;
    } catch (e) {
      if (e.code !== "EEXIST") {
        throw e;
      }
    }
  }
}

export function saveMeta(id, meta) {
  fs.writeFileSync(path.join(runDir(id), "meta.json"), JSON.stringify(meta, null, 2));
}

export function loadMeta(id) {
  const f = path.join(runDir(id), "meta.json");
  if (!/^[0-9a-f]{6}$/.test(id) || !fs.existsSync(f)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

export const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Editing runs currently active in place on this repo (for isolation: auto). */
export function activeInplace(root) {
  const dir = runsDir();
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .map(loadMeta)
    .filter(
      (m) => m && m.phase === "running" && m.isolation === "inplace" && m.editing && m.root === root && alive(m.pid),
    );
}

const cooldownFile = () => path.join(baseDir(), "cooldowns.json");

export function cooldowns() {
  try {
    const all = JSON.parse(fs.readFileSync(cooldownFile(), "utf8"));
    const now = Date.now();
    return Object.fromEntries(Object.entries(all).filter(([, v]) => v.until > now));
  } catch {
    return {};
  }
}

export function setCooldown(pool, ms, reason) {
  const all = cooldowns();
  all[pool] = { until: Date.now() + ms, reason };
  fs.mkdirSync(baseDir(), { recursive: true });
  fs.writeFileSync(cooldownFile(), JSON.stringify(all, null, 2));
}
