import fs from "node:fs";
import path from "node:path";

import { removeDirSafe, removeWorktree } from "./links.mjs";
import { APPLICABLE, EDITING } from "./runner.mjs";
import { loadMeta, promptsDir, runDir, runsDir, working } from "./state.mjs";

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
  if (!EDITING.has(meta.role) || meta.applied || meta.discarded) {
    return null;
  }
  if (meta.phase === "running" || meta.phase === "interrupted") {
    return meta.isolation === "inplace" ? "interrupted; partial edits may be in the working tree" : "interrupted";
  }
  if (!meta.files?.changed?.length) {
    return null;
  }
  if (!APPLICABLE.has(meta.status)) {
    // Its out-of-scope files are restored; its in-scope edits stay until discard.
    return meta.isolation === "inplace" ? `${meta.status}, not discarded: its edits are still in the working tree` : null;
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

    if (meta && working(meta)) {
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
  // Prompts kept for native subagents: nothing refers to them once the task is done.
  if (!dryRun && fs.existsSync(promptsDir())) {
    for (const f of fs.readdirSync(promptsDir())) {
      const file = path.join(promptsDir(), f);
      try {
        if (now - fs.statSync(file).mtimeMs >= maxAgeMs) {
          fs.rmSync(file, { force: true });
        }
      } catch {
        // Removed meanwhile (another prune): nothing left to do for it.
      }
    }
  }
  return out;
}
