import fs from "node:fs";
import path from "node:path";

import { removeDirSafe, removeWorktree } from "./links.mjs";
import { APPLICABLE, EDITING } from "./runner.mjs";
import { alive, loadMeta, runDir, runsDir } from "./state.mjs";

// A run's meta is saved when it starts; no run lives this long, so a
// "running" run this old has a reused pid, not a live worker.
const MAX_RUN_MS = 6 * 3600000;

/** "90m", "24h", "7d", "0" → ms. */
export function parseAge(s) {
  const m = String(s).match(/^(\d+(?:\.\d+)?)(m|h|d)?$/);
  if (!m) {
    return null;
  }
  return +m[1] * { m: 60000, h: 3600000, d: 86400000 }[m[2] ?? "h"];
}

/** What is left of a run that isn't running, in the words the orchestrator needs. */
function pending(meta) {
  if (!meta) {
    return "unreadable run state";
  }
  if (meta.phase === "running") {
    return EDITING.has(meta.role) && meta.isolation === "inplace"
      ? "interrupted; partial edits may be in the working tree"
      : "interrupted";
  }
  if (!EDITING.has(meta.role) || meta.applied || meta.discarded || !APPLICABLE.has(meta.status)) {
    return null;
  }
  if (!meta.files?.changed?.length) {
    return null;
  }
  return meta.isolation === "worktree"
    ? "unapplied worktree result"
    : "undecided in-place change (already in the working tree)";
}

function readMeta(id) {
  try {
    return loadMeta(id);
  } catch {
    return null;
  }
}

/**
 * Remove run state older than maxAgeMs: worktrees, logs, patches, quarantine.
 * An unapplied worktree result is discarded with it. An undecided in-place
 * change stays in the working tree as it is; only its state goes, so it can
 * no longer be discarded or unapplied through dispatch.
 */
export function prune({ maxAgeMs, dryRun = false }) {
  const out = { v: 1, dryRun, removed: [], kept: [], errors: [] };
  if (!fs.existsSync(runsDir())) {
    return out;
  }
  const now = Date.now();
  for (const id of fs.readdirSync(runsDir())) {
    if (!/^[0-9a-f]{6}$/.test(id)) {
      continue;
    }
    const dir = runDir(id);
    const meta = readMeta(id);
    let mtime;
    try {
      mtime = fs.statSync(meta ? path.join(dir, "meta.json") : dir).mtimeMs;
    } catch {
      continue;
    }
    const age = now - mtime;
    const entry = { id, role: meta?.role ?? null, status: meta?.status ?? null, ageHours: +(age / 3600000).toFixed(1) };
    const left = pending(meta);

    if (meta?.phase === "running" && alive(meta.pid) && age < MAX_RUN_MS) {
      out.kept.push({ ...entry, reason: "running" });
      continue;
    }
    if (age < maxAgeMs) {
      if (left) {
        out.kept.push({ ...entry, reason: `recent; ${left}` });
      }
      continue;
    }
    if (!dryRun) {
      try {
        // Links are stripped whether or not meta recorded them.
        removeWorktree(meta?.worktree ?? path.join(dir, "wt"), meta?.root);
        removeDirSafe(dir);
      } catch (e) {
        out.errors.push({ id, error: String(e.message ?? e) });
        continue;
      }
    }
    out.removed.push({ ...entry, ...(left ? { dropped: left } : {}) });
  }
  return out;
}
