import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { canonical } from "./glob.mjs";

const WIN = process.platform === "win32";

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

/** A running run's meta is saved at least this often; older, its pid is someone else's. */
export const BEAT_MS = 5 * 60000;
const STALE_MS = 4 * BEAT_MS;
const RENAME_RETRIES = 100;
const RENAME_WAIT_MS = 10;
const renameWait = new Int32Array(new SharedArrayBuffer(4));

/**
 * Written aside and renamed over, so another dispatch (doctor, prune, a
 * discard) never reads a half-written file, nor does a killed write leave one.
 */
export function saveMeta(id, meta) {
  if (meta.phase === "running") {
    meta.beat = Date.now();
  }
  const file = path.join(runDir(id), "meta.json");
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(meta, null, 2));
    // Windows refuses to replace a file while another process briefly has it open for reading.
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(temporary, file);
        break;
      } catch (e) {
        if (!WIN || !["EPERM", "EACCES"].includes(e.code) || attempt >= RENAME_RETRIES) {
          throw e;
        }
        Atomics.wait(renameWait, 0, 0, RENAME_WAIT_MS);
      }
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function loadMeta(id) {
  const f = path.join(runDir(id), "meta.json");
  if (!/^[0-9a-f]{6}$/.test(id) || !fs.existsSync(f)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

/** loadMeta for a scan of every run: unreadable state is skipped, not a reason for the scan to fail. */
export function readMeta(id) {
  try {
    return loadMeta(id);
  } catch {
    return null;
  }
}

export const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// FILETIME counts 100 ns steps from 1601; Date.now() counts ms from 1970.
const FILETIME_EPOCH_MS = 11644473600000;
// A start time and Date.now() read the same clock, but not at the same
// instant; Linux gives boot time in whole seconds.
const CLOCK_SLACK_MS = 2000;

/** Every running process: pid → { parent, group, created (ms) }. Null when they can't be listed. */
function processTable() {
  return WIN ? windowsProcesses() : process.platform === "linux" ? linuxProcesses() : null;
}

function windowsProcesses() {
  const listed = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CreationDate.ToFileTimeUtc())" }',
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30000 },
  );
  if (listed.status !== 0) {
    return null;
  }
  const table = new Map();
  for (const line of listed.stdout.split(/\r?\n/)) {
    const [id, parent, created] = line.trim().split(" ").map(Number);
    if (id && created) {
      table.set(id, { parent, group: null, created: created / 10000 - FILETIME_EPOCH_MS });
    }
  }
  return table.size ? table : null;
}

let clockTicks;
function linuxProcesses() {
  try {
    const boot = Number(fs.readFileSync("/proc/stat", "utf8").match(/^btime (\d+)$/m)[1]) * 1000;
    clockTicks ??= Number(spawnSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).stdout) || 100;
    const table = new Map();
    for (const id of fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
      let stat;
      try {
        stat = fs.readFileSync(`/proc/${id}/stat`, "utf8");
      } catch {
        continue; // Exited while listing.
      }
      // Fields after the name, which is in parentheses and may hold anything.
      const [state, parent, group, ...rest] = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      if (state !== "Z") {
        table.set(Number(id), {
          parent: Number(parent),
          group: Number(group),
          created: boot + (Number(rest[16]) / clockTicks) * 1000,
        });
      }
    }
    return table;
  } catch {
    return null;
  }
}

// Without a start time to tell them apart, a pid older than this belongs to another process.
const MAX_WORKER_MS = 6 * 3600000;

/**
 * The process dispatch started at `since` (a worker, a check's shell), or one
 * it started, is still running. Windows ends dispatch's own children with it
 * (node puts them in a kill-on-close job) but not theirs: a check's shell or
 * a harness's .cmd shim dies and what it ran goes on. A process keeps its
 * parent's id after the parent exits, so those are found by it; off Windows,
 * also by the process group the one dispatch started leads (see start and
 * runShell). Start times tell a process from a later one that reused its id.
 * When they can't be read, a pid is trusted for MAX_WORKER_MS, and on Windows,
 * where only the listing finds the survivors, the run counts as working.
 */
function survives(pid, since, listing) {
  const table = listing();
  if (!table) {
    return Date.now() - since < MAX_WORKER_MS && (WIN || alive(pid) || alive(-pid));
  }
  // A process that took over the pid came after everything this one started.
  const own = table.get(pid);
  const reusedAt = own && own.created > since + CLOCK_SLACK_MS ? own.created : Infinity;
  if (own && reusedAt === Infinity) {
    return true;
  }
  const ours = (p) => p.created >= since - CLOCK_SLACK_MS && p.created < reusedAt;
  const found = new Set([pid]);
  for (const p of found) {
    for (const [id, q] of table) {
      if (q.parent === p && (p !== pid || ours(q))) {
        found.add(id);
      }
    }
  }
  return found.size > 1 || [...table.values()].some((q) => q.group === pid && ours(q));
}

/**
 * The run is still working: its dispatch is (and says so), or the worker or
 * check it started is, as when dispatch was killed or failed and they were not.
 * `seen.unlisted` is set when that took processes Windows couldn't list.
 */
export function working(meta, seen = {}) {
  if (meta.phase === "running" && Date.now() - (meta.beat ?? 0) < STALE_MS && alive(meta.pid)) {
    return true;
  }
  if (meta.phase !== "running" && meta.phase !== "interrupted") {
    return false;
  }
  // Listed once, and only when a process is left to look for.
  let table;
  const listing = () => {
    if (table === undefined) {
      table = processTable();
      seen.unlisted = WIN && !table;
    }
    return table;
  };
  return (
    (!!meta.workerPid && survives(meta.workerPid, meta.workerStarted ?? 0, listing)) ||
    (!!meta.checkPid && survives(meta.checkPid, meta.checkStarted ?? 0, listing))
  );
}

/** Reviews still working in this run's worktree: it can't go while they read it. */
export function reviewersOf(id) {
  const dir = runsDir();
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .map(readMeta)
    .filter((m) => m && m.reviewOf === id && m.sharedWorkDir && working(m));
}

/**
 * Editing runs currently active in place on this repo (for isolation: auto).
 * With unfinished, also those cut short and not yet discarded: their partial
 * edits are still in the tree.
 */
export function activeInplace(root, { unfinished = false } = {}) {
  const dir = runsDir();
  if (!fs.existsSync(dir)) {
    return [];
  }
  const cutShort = (m) =>
    unfinished && (m.phase === "running" || m.phase === "interrupted") && !m.discarded && !m.applied;
  return fs
    .readdirSync(dir)
    .map(readMeta)
    .filter((m) => m && m.isolation === "inplace" && m.editing && m.root === root && (working(m) || cutShort(m)));
}

export const promptsDir = () => path.join(baseDir(), "prompts");

/** Keep a worker's whole prompt where a native subagent can be given it. Same prompt, same file. */
export function savePrompt(text) {
  const file = path.join(promptsDir(), `${crypto.createHash("sha256").update(text).digest("hex").slice(0, 16)}.md`);
  fs.mkdirSync(promptsDir(), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
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
