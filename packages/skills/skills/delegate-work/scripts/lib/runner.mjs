import fs from "node:fs";
import path from "node:path";

import { adapters, harnessNames } from "../../adapters/index.mjs";
import { checkEnv, resolveChecks, runChecks } from "./checks.mjs";
import { load, skillDir, validate } from "./config.mjs";
import * as G from "./git.mjs";
import { canonical, matchAny, toPosix } from "./glob.mjs";
import { linkDeps, linksTo, removeDirSafe, removeWorktree, stripLinks, unlinkSafe } from "./links.mjs";
import { start, withoutSecrets } from "./proc.mjs";
import { envelope, parseResult } from "./result.mjs";
import { candidates, nextTier, orchestratorPools } from "./route.mjs";
import {
  activeInplace,
  BEAT_MS,
  loadMeta,
  newRun,
  runDir,
  savePrompt,
  saveMeta,
  setCooldown,
  working,
} from "./state.mjs";

export const EDITING = new Set(["fixer", "builder"]);
export const APPLICABLE = new Set(["ok", "failed_checks", "blocked"]);
const VERDICTS = new Set(["approve", "approve-with-nits", "reject"]);
const DEFAULT_STEPS = { scout: 40, fixer: 40, builder: 150, reviewer: 30 };
const DEFAULT_TIMEOUT = { scout: 300, fixer: 600, builder: 1800, reviewer: 600 };
// A reviewer's brief carries the diff up to this size; the changed files are readable anyway.
const REVIEW_DIFF_CAP = 60000;

export class UsageError extends Error {}

// Snapshots and worktree creation share git's lock files; serialize them.
let setupLock = Promise.resolve();
// oxlint-disable-next-line promise/prefer-await-to-then -- the chain is the lock; each step runs after the last settles.
const serial = (fn) => (setupLock = setupLock.then(fn, fn));

// ---------- dependency folders ----------

const SKIP_WALK = new Set([
  ".git",
  "dist",
  "build",
  "target",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".wrangler",
]);
const DEP_DIRS = new Set(["node_modules", ".venv", "venv"]);
// pnpm 10+ installs before `pnpm run` when it thinks dependencies are stale,
// and in a worktree they always look stale: its paths differ from the ones
// pnpm recorded. The install writes through the linked node_modules and
// repoints the repository's own links at the worktree.
const NO_AUTO_INSTALL = { pnpm_config_verify_deps_before_run: "false" };
const INSTALL_MARKERS = [".package-lock.json", ".modules.yaml", ".yarn-state.yml", ".yarn-integrity", "pyvenv.cfg"];

function findDepDirs(root, depth = 4) {
  const found = [];
  const walk = (dir, d) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) {
        continue;
      }
      const full = path.join(dir, e.name);
      if (DEP_DIRS.has(e.name)) {
        found.push(toPosix(path.relative(root, full)));
        continue;
      }
      if (d < depth && !SKIP_WALK.has(e.name) && !e.name.startsWith(".")) {
        walk(full, d + 1);
      }
    }
  };
  walk(root, 0);
  return found;
}

/** Changes only when something installs; build caches inside node_modules don't count. */
function depsFingerprint(root, dirs) {
  return dirs
    .map((d) =>
      INSTALL_MARKERS.map((m) => {
        try {
          return fs.statSync(path.join(root, d, m)).mtimeMs;
        } catch {
          return 0;
        }
      }).join(","),
    )
    .join("|");
}

const WIN = process.platform === "win32";

const cleanupWorktree = (meta) => removeWorktree(meta.worktree, meta.root);

/**
 * A worktree's .git file tells git which repository, and so which config, to
 * use. Put back what `git worktree add` wrote before dispatch runs git there.
 */
function guardGitFile(meta) {
  if (!meta.gitFile) {
    return;
  }
  const f = path.join(meta.worktree, ".git");
  let now = null;
  try {
    now = fs.lstatSync(f).isFile() ? fs.readFileSync(f, "utf8") : "";
  } catch {
    // Deleted.
  }
  if (now === meta.gitFile) {
    return;
  }
  unlinkSafe(f);
  removeDirSafe(f);
  fs.writeFileSync(f, meta.gitFile);
  meta.gitFileRestored = true;
}

// ---------- writing files into a tree ----------

/**
 * Files whose path under root goes through a link (symlink or junction): a
 * write or delete there would land wherever the link points, which a worker
 * may have chosen.
 */
function throughLinks(root, files) {
  return files.filter((f) => {
    let p = root;
    for (const part of f.split("/")) {
      p = path.join(p, part);
      try {
        if (fs.lstatSync(p).isSymbolicLink()) {
          return true;
        }
      } catch {
        // Missing from here on: nothing to follow.
        return false;
      }
    }
    return false;
  });
}

const linkHint = (files) => `Not written, their path goes through a link: ${files.slice(0, 10).join(", ")}`;

/** Files that are symbolic links in ref: a worker's link may point anywhere, so apply won't write one. */
const linksIn = (ref, files, cwd) => files.filter((f) => G.mode(ref, f, cwd) === "120000");

/**
 * Make files in root byte-identical to their version in ref (snapshot or post
 * tree), executable bit and links included where the OS has them. Git on
 * Windows checks a link out as a file holding its target, and so does this.
 */
function writeFrom(root, ref, files) {
  const linked = throughLinks(root, files);
  if (linked.length) {
    // Callers check first; this is the last guard.
    throw new Error(linkHint(linked));
  }
  for (const f of files) {
    const data = G.blob(ref, f, root);
    const full = path.join(root, f);
    if (!data) {
      fs.rmSync(full, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const mode = WIN ? null : G.mode(ref, f, root);
    if (mode === "120000") {
      fs.rmSync(full, { force: true });
      fs.symlinkSync(data.toString("utf8"), full);
      continue;
    }
    fs.writeFileSync(full, data);
    if (mode) {
      const now = fs.statSync(full).mode & 0o777;
      // Executable wherever readable, as git checks it out; otherwise not executable at all.
      fs.chmodSync(full, mode === "100755" ? now | ((now & 0o444) >> 2) : now & ~0o111);
    }
  }
}

/** Files whose content in root is no longer their version in ref: someone else edited them. */
function differsFrom(root, ref, files) {
  return files.filter((f) => G.fileId(root, f) !== G.blobId(ref, f, root));
}

/**
 * Files that are neither `from` nor already `to`: edited by someone else. A
 * file already at `to` is one an interrupted apply, discard or unapply wrote,
 * so running it again completes the operation.
 */
function foreignEdits(root, from, to, files) {
  const moved = differsFrom(root, from, files);
  return moved.length ? differsFrom(root, to, moved) : [];
}

/**
 * Publish the in-place claim before looking at other runs: of two runs that
 * start together, at least one sees the other, and the earlier claim keeps
 * the working tree.
 */
function claimInplace(meta) {
  Object.assign(meta, { isolation: "inplace", phase: "running", claimedAt: Date.now() });
  saveMeta(meta.id, meta);
  const [first] = activeInplace(meta.root).sort(
    (a, b) => (a.claimedAt ?? 0) - (b.claimedAt ?? 0) || a.id.localeCompare(b.id),
  );
  return first?.id === meta.id ? "inplace" : "worktree";
}

// ---------- prompt ----------

function preamble({ role, allow, read, checks }) {
  const tpl = fs.readFileSync(path.join(skillDir, "references", "worker-preamble.md"), "utf8");
  const report =
    {
      scout: "report:\n<your whole answer, in the form the task asks for>",
      reviewer:
        "verdict: approve | approve-with-nits | reject\nreport:\n<every issue in full: file, line, problem, why it matters>",
    }[role] ?? "";
  return tpl
    .replace("{{ALLOW}}", EDITING.has(role) ? allow.join(", ") : "none (read-only task: do not edit any file)")
    .replace("{{READ}}", read.length ? read.join(", ") : "any file in the repository")
    .replace(
      "{{CHECKS}}",
      checks.length
        ? `${checks.map((c) => c.cmd).join(" ; ")} (one at a time: run together, they can collide over the same build output)`
        : "none; do not run install or build commands",
    )
    .replace("{{REPORT_INSTRUCTIONS}}", report);
}

function estimateTokens(root, files, globs, prompt) {
  let bytes = prompt.length;
  if (globs.length) {
    for (const f of files) {
      if (!matchAny(f, globs)) {
        continue;
      }
      try {
        bytes += fs.statSync(path.join(root, f)).size;
      } catch {
        // Deleted since it was listed.
      }
      if (bytes > 50e6) {
        break;
      }
    }
  }
  return Math.round(bytes / 3.5) + 15000;
}

// ---------- execution ----------

/** A harness-reported edit as a normalized path relative to the work dir: `src/../x` is `x`. */
const relativeEdit = (workDir, f) =>
  path.posix.normalize(toPosix(path.isAbsolute(f) ? path.relative(workDir, canonical(f)) : f));

/** In the allowlist and inside the work dir: `**` alone would also match `../x`. */
const inScope = (f, allow) => !/^(\.\.(\/|$)|\/|[a-z]:\/)/i.test(f) && matchAny(f, allow);

function newAcc() {
  return { sessionId: null, edits: [], denied: [], texts: [], stepTexts: [], errors: [], steps: 0 };
}

function hintFor(kind, harness) {
  return (
    {
      auth: `${harness} is not authenticated for this provider; log in again, then retry.`,
      billing:
        "The provider refused for lack of credits or a spent key limit; add credits, raise the limit, or disable the route. Its pool cools down for 6 hours.",
      rate_limit: "All configured routes are rate-limited or out of quota; retry later or use native subagents.",
      unavailable: `Model not found, or its provider isn't logged in to ${harness}. Check ids and logins with \`dispatch doctor\`.`,
      transient: "Network or provider errors on every route; retry later.",
    }[kind] ?? "Worker process failed; see logPath."
  );
}

async function resetWork(meta) {
  if (!meta.editing) {
    return;
  }
  // A follow-up goes back to the result it followed up, not to the start.
  const base = meta.resetTo ?? meta.snap;
  if (meta.isolation === "worktree" && !meta.resetTo) {
    const ex = [...(meta.linked ?? []), ...(meta.copied ?? [])].flatMap((p) => ["-e", p]);
    // Only dispatch's own links may stay: git must not clean through one a worker made.
    stripLinks(
      meta.workDir,
      (meta.linked ?? []).map((d) => path.join(meta.workDir, d)),
    );
    G.git(["reset", "-q", "--hard", meta.snap], { cwd: meta.workDir });
    G.git(["clean", "-q", "-fd", ...ex], { cwd: meta.workDir });
  } else if (meta.isolation === "worktree") {
    const tree = G.workingTree(meta.workDir, path.join(runDir(meta.id), "reset.index"));
    const files = G.numstat(base, tree, meta.workDir)
      .map((c) => c.path)
      .filter((f) => !throughLinks(meta.workDir, [f]).length);
    writeFrom(meta.workDir, base, files);
  } else {
    const tree = G.workingTree(meta.root, path.join(runDir(meta.id), "reset.index"));
    const files = G.numstat(base, tree, meta.root).map((c) => c.path);
    // Anything edited in the tree meanwhile is restored too; keep a copy.
    meta.resets = (meta.resets ?? 0) + 1;
    const copy = path.join(runDir(meta.id), `reset-${meta.resets}`);
    for (const f of files) {
      const src = path.join(meta.root, f);
      if (fs.existsSync(src) && !throughLinks(meta.root, [f]).length) {
        fs.mkdirSync(path.dirname(path.join(copy, f)), { recursive: true });
        fs.copyFileSync(src, path.join(copy, f));
      }
    }
    if (fs.existsSync(copy)) {
      meta.resetCopies = [...(meta.resetCopies ?? []), copy];
    }
    writeFrom(meta.root, base, files);
  }
}

/** runAttempts(), saving meta as it goes: however long the worker and the checks take, the run shows it is alive. */
async function execute(meta, ...rest) {
  const beat = setInterval(() => saveMeta(meta.id, meta), BEAT_MS);
  try {
    return await runAttempts(meta, ...rest);
  } finally {
    clearInterval(beat);
  }
}

/**
 * Run the worker over the candidate list, falling back on infrastructure
 * failures, then evaluate the outcome. Mutates and returns meta.
 */
async function runAttempts(meta, cfg, list, prompt, sessionId) {
  const t0 = Date.now();
  const maxSteps = cfg.limits?.maxSteps?.[meta.role] ?? DEFAULT_STEPS[meta.role];
  const timeoutMs = 1000 * (cfg.limits?.timeoutSec?.[meta.role] ?? DEFAULT_TIMEOUT[meta.role]);
  const depDirs = findDepDirs(meta.root);
  // A worktree is checked out byte-exact; git inside it needs the same view.
  const gitEnv = meta.isolation === "worktree" ? G.bytesEnv(meta.workDir) : {};
  let outcome = null;
  let lastFailure = null;
  // A follow-up adds attempts to the run; each keeps its own log.
  let attempt = Math.max(
    0,
    ...fs.readdirSync(runDir(meta.id)).map((f) => Number(f.match(/^log-(\d+)\.jsonl$/)?.[1] ?? 0)),
  );

  for (const c of list) {
    attempt++;
    const acc = newAcc();
    const depsBefore = depsFingerprint(meta.root, depDirs);
    const cmd = c.adapter.command({
      route: c.route,
      cwd: meta.workDir,
      prompt,
      readOnly: !meta.editing,
      allow: meta.allow,
      bashAllow: meta.checkCmds,
      depDirs,
      sessionId,
    });
    const logPath = path.join(runDir(meta.id), `log-${attempt}.jsonl`);
    const proc = start(c.adapter.detect().bin, cmd.args, {
      cwd: meta.workDir,
      // Marks the process tree as a worker: dispatch refuses to run inside it.
      env: {
        ...withoutSecrets([
          ...(c.adapter.authEnv?.(c.route) ?? []),
          ...(c.route.passEnv ?? []),
          ...(cfg.project.passEnv ?? []),
        ]),
        ...gitEnv,
        ...NO_AUTO_INSTALL,
        ...checkEnv(meta.checkList ?? []),
        ...cmd.env,
        DELEGATE_WORK_WORKER: "1",
      },
      input: cmd.input,
      timeoutMs,
      stdoutFile: logPath,
      stderrFile: path.join(runDir(meta.id), `stderr-${attempt}.log`),
      onLine: (line) => {
        const before = acc.edits.length;
        c.adapter.parseLine(line, acc);
        for (const f of acc.edits.slice(before)) {
          const r = relativeEdit(meta.workDir, f);
          if (!meta.editing || !inScope(r, meta.allow)) {
            proc.kill("out_of_scope");
          }
        }
        if (acc.steps > maxSteps) {
          proc.kill("steps");
        }
      },
    });
    // Should dispatch be killed, the worker may outlive it; its run is still working then.
    Object.assign(meta, { workerPid: proc.pid, workerStarted: Date.now() });
    saveMeta(meta.id, meta);
    // oxlint-disable-next-line no-await-in-loop -- candidates run one at a time: the next only after this one failed.
    const res = await proc.done;
    meta.workerPid = null;
    guardGitFile(meta);
    c.adapter.parseStderr?.(res.stderrTail, acc);
    meta.logPath = logPath;
    meta.worker = {
      modelId: c.modelId,
      route: c.route.id,
      harness: c.route.harness,
      model: c.route.model,
      family: c.family,
      tier: meta.tier,
      kind: meta.kind,
      skipped: meta.skipped,
    };
    meta.sessionId = acc.sessionId ?? sessionId ?? null;
    const text = c.adapter.finalText(acc);
    const parsed = parseResult(text);

    if (res.killedFor) {
      outcome = { acc, parsed, killed: res.killedFor, depsBefore, depDirs, gitEnv };
      break;
    }
    const cls = c.adapter.classify({ code: res.code, acc, stderrTail: res.stderrTail });
    if (cls.kind === "ok" || parsed.status) {
      outcome = { acc, parsed, depsBefore, depDirs, gitEnv };
      break;
    }

    // Infrastructure failure: record, cool the pool down, reset, try the next route.
    lastFailure = { kind: cls.kind, harness: c.route.harness };
    meta.skipped.push({
      modelId: c.modelId,
      route: c.route.id,
      reason: `${cls.kind}: ${cls.message?.split("\n")[0] ?? ""}`.slice(0, 200),
    });
    if (cls.kind === "rate_limit") {
      setCooldown(c.route.quotaPool, cls.retryAfterMs ?? 10 * 60000, "rate limit");
    }
    if (cls.kind === "auth") {
      setCooldown(c.route.quotaPool, 60 * 60000, "auth failed");
    }
    if (cls.kind === "billing") {
      setCooldown(c.route.quotaPool, 6 * 3600000, "no credits");
    }
    if (cls.kind === "transient") {
      setCooldown(c.route.quotaPool, cls.retryAfterMs, "provider errors");
    }
    // oxlint-disable-next-line no-await-in-loop -- the next candidate starts from the restored tree.
    await resetWork(meta);
  }

  meta.durationMs = Date.now() - t0;
  if (!outcome) {
    meta.status = lastFailure ? "harness_error" : "not_available";
    meta.hint = lastFailure
      ? hintFor(lastFailure.kind, lastFailure.harness)
      : noRouteHint(meta.skipped);
    meta.files = { changed: [], outOfScope: [] };
  } else {
    await evaluate(meta, cfg, outcome);
  }
  if (meta.resetCopies?.length) {
    const note = `A failed attempt's changes were undone in the working tree; the files it restored were copied first to ${meta.resetCopies.join(", ")}.`;
    meta.hint = [meta.hint, note].filter(Boolean).join(" ");
  }
  return meta;
}

async function evaluate(meta, cfg, { acc, parsed, killed, depsBefore, depDirs, gitEnv }) {
  const post = G.workingTree(meta.workDir, path.join(runDir(meta.id), "post.index"));
  const ignore = [...(meta.linked ?? []), ...(meta.copied ?? [])];
  const changed = G.numstat(meta.snap, post, meta.workDir).filter((c) => !ignore.includes(c.path));
  const reported = new Set(acc.edits.map((f) => relativeEdit(meta.workDir, f)));
  // A read-only worker has no edit tools: changes it didn't report are
  // someone else's (a concurrent run, the orchestrator) and stay as they are.
  const outOfScope = changed
    .map((c) => c.path)
    .filter((f) => (meta.editing ? !matchAny(f, meta.allow) : reported.has(f)));
  if (depsFingerprint(meta.root, depDirs) !== depsBefore) {
    outOfScope.push("(dependency folder changed: install detected)");
  }
  if (meta.gitFileRestored) {
    outOfScope.push("(worktree .git file changed: restored)");
  }
  // The checks would run whatever tools a replaced dependency link holds.
  for (const d of meta.linked ?? []) {
    if (!linksTo(path.join(meta.workDir, d), path.join(meta.root, d))) {
      outOfScope.push(`(dependency link ${d} replaced)`);
    }
  }
  // Writes git can't see (ignored files, paths outside the tree) are known
  // only from the harness's edit events, and can't be restored from the snapshot.
  const seen = new Set(changed.map((c) => c.path));
  const unseen = meta.editing ? [...reported].filter((f) => !seen.has(f)) : [];
  for (const f of unseen.filter((f) => !inScope(f, meta.allow))) {
    outOfScope.push(`(invisible to git, not restored) ${f}`);
  }
  // An allowed edit the work dir doesn't show: reverted, ignored, or written
  // into another directory (a harness that ignored the work dir it was given).
  const missing = unseen.filter((f) => inScope(f, meta.allow));

  meta.post = post;
  meta.files = { changed, outOfScope };
  // Harnesses report absolute paths; relative ones are shorter and match --allow.
  const prefixes = [...new Set([meta.workDir, toPosix(meta.workDir)])].map((p) => p.replace(/[\\/]$/, ""));
  const relative = (d) =>
    prefixes.reduce((s, p) => s.split(`${p}\\`).join("").split(`${p}/`).join("").split(`"${p}"`).join("."), d);
  meta.denied = [...new Set(acc.denied.map(relative))].slice(0, 20);
  meta.notes = parsed.notes;
  meta.summary = parsed.summary;
  if (!meta.editing) {
    const verdict = meta.role === "reviewer" && VERDICTS.has(parsed.verdict) ? parsed.verdict : null;
    meta.report = [verdict && `verdict: ${verdict}`, parsed.report].filter(Boolean).join("\n") || parsed.summary;
    if (meta.role === "reviewer" && !verdict) {
      meta.hint = "The reviewer gave no valid verdict (approve, approve-with-nits or reject); judge from the report.";
    }
    // The result caps the report; the whole text stays readable here.
    if (meta.report) {
      meta.reportPath = path.join(runDir(meta.id), "report.md");
      fs.writeFileSync(meta.reportPath, meta.report);
    }
  }
  fs.writeFileSync(path.join(runDir(meta.id), "patch.diff"), G.patch(meta.snap, post, meta.workDir));

  // Restore out-of-scope files wherever the work dir is shared (the real tree,
  // or a reviewed run's worktree). A private worktree is simply never applied.
  const quarantine = () => {
    if (meta.isolation !== "inplace" && !meta.sharedWorkDir) {
      return;
    }
    // Real changed paths only: the notes in parentheses aren't files, but a
    // file's name may start with one.
    const candidates = outOfScope.filter((f) => seen.has(f));
    const linked = throughLinks(meta.workDir, candidates);
    const files = candidates.filter((f) => !linked.includes(f));
    const qdir = path.join(runDir(meta.id), "quarantine");
    for (const f of files) {
      const src = path.join(meta.workDir, f);
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(path.join(qdir, f)), { recursive: true });
        fs.copyFileSync(src, path.join(qdir, f));
      }
    }
    writeFrom(meta.workDir, meta.snap, files);
    const notes = [meta.hint];
    if (files.length) {
      notes.push(`Out-of-scope files were restored; their changed versions are kept in ${qdir}.`);
    }
    if (linked.length) {
      notes.push(linkHint(linked));
    }
    meta.hint = notes.filter(Boolean).join(" ") || null;
  };

  if (killed === "timeout" || killed === "steps") {
    meta.status = "timeout";
    meta.hint = killed === "steps" ? "Step budget exceeded." : "Time budget exceeded.";
    quarantine();
  } else if (killed === "out_of_scope" || outOfScope.length) {
    meta.status = "out_of_scope";
    quarantine();
  } else if (parsed.status === "blocked") {
    meta.status = "blocked";
  } else if (meta.editing && !changed.length) {
    meta.status = "no_changes";
  } else if (meta.editing) {
    const timeout = 1000 * (cfg.limits?.checkTimeoutSec ?? 900);
    const depsBeforeChecks = depsFingerprint(meta.root, depDirs);
    meta.checks = await runChecks(meta.checkList, meta.workDir, timeout, {
      ...withoutSecrets(cfg.project.passEnv ?? []),
      ...gitEnv,
      ...NO_AUTO_INSTALL,
    });
    // The checks ran the worker's code.
    guardGitFile(meta);
    if (depsFingerprint(meta.root, depDirs) !== depsBeforeChecks) {
      meta.files.outOfScope.push("(dependency folder changed during the checks: install detected)");
    }
    // What checks leave behind (unignored reports, caches) isn't someone's edit.
    meta.settled = meta.checkList.length
      ? G.workingTree(meta.workDir, path.join(runDir(meta.id), "settled.index"))
      : meta.post;
    meta.status = meta.checks.every((c) => c.ok) ? "ok" : "failed_checks";
    if (meta.gitFileRestored) {
      meta.files.outOfScope.push("(worktree .git file changed by the checks: restored)");
    }
    if (meta.files.outOfScope.length) {
      meta.status = "out_of_scope";
    }
    if (!meta.checkList.length) {
      meta.hint = "No checks could be inferred for this project; verify the change yourself.";
    }
  } else {
    meta.status = "ok";
    if (changed.length) {
      meta.hint = `Changed in the tree during this read-only run, left as they are: ${changed
        .slice(0, 10)
        .map((c) => c.path)
        .join(", ")}`;
    }
  }
  if (missing.length) {
    const note = `The worker reported editing ${missing.slice(0, 10).join(", ")}, but the work dir doesn't show them changed: reverted, gitignored, or written somewhere else. Check your working tree.`;
    meta.hint = [meta.hint, note].filter(Boolean).join(" ");
  }
  return meta;
}

/**
 * Dispatch failed partway through a run: keep it as interrupted, so doctor
 * lists it and discard restores what it may have written.
 */
function interrupted(meta, e) {
  meta.phase = "interrupted";
  meta.workerPid = null;
  return new Error(`run ${meta.id} was interrupted (discard it to restore its files): ${e.message}`, { cause: e });
}

/** The run itself is still working (a first run or a follow-up): its result isn't final. */
const stillWorking = working;
const workingHint = (id) => {
  const meta = loadMeta(id);
  return meta && !working({ ...meta, workerPid: null })
    ? `Run ${id}'s dispatch stopped, but its worker (process ${meta.workerPid}) is still running; wait for it to exit, or end it.`
    : `Run ${id} is still working; wait for its result.`;
};

/** Another run still working in this tree: writing into it now would be counted as that run's change. */
function busyTree(meta) {
  const [other] = activeInplace(meta.root).filter((m) => m.id !== meta.id);
  return other ? `In-place run ${other.id} is still working in this tree; try again when it finishes.` : null;
}

/** Why nothing could run: each route left out and its reason, which doctor alone wouldn't say. */
function noRouteHint(skipped) {
  const why = skipped
    .slice(0, 6)
    .map((s) => `${s.modelId}${s.route ? ` via ${s.route}` : ""} (${s.reason})`)
    .join("; ");
  return why ? `No usable route for this tier: ${why}.` : "No usable route for this tier. Run `dispatch doctor`.";
}

const nativeHint = (model) =>
  `Run this task as a native subagent with ${model}, and give it the text at promptPath: your brief with the worker rules in front.`;

const IN_PLACE_ONLY_HINT =
  "Every usable route for this tier edits only in a worktree; rerun without --isolation inplace.";

/**
 * Isolation for a run and the candidates that can run with it. Some harnesses
 * can't be kept to the allowlist in the real tree (containedInPlace: false):
 * an editing run that may reach one gets a worktree, or skips them when in
 * place was asked for. "auto" is left for a lone editing run, which works in
 * place unless another run holds the tree.
 */
function isolationFor(o, editing, candidates) {
  const uncontained = (c) => editing && c.adapter.containedInPlace === false;
  let isolation = o.isolation ?? "auto";
  if (isolation === "auto" && !editing) {
    isolation = "inplace";
  } else if (isolation === "auto" && (o.forceWorktree || candidates.some(uncontained))) {
    isolation = "worktree";
  }
  if (isolation === "worktree") {
    return { isolation, candidates, skipped: [] };
  }
  return {
    isolation,
    candidates: candidates.filter((c) => !uncontained(c)),
    skipped: candidates
      .filter(uncontained)
      .map((c) => ({ modelId: c.modelId, route: c.route.id, reason: `${c.route.harness}: can't edit in place` })),
  };
}

/** What `run` would do, without running anything or touching run state. */
function plan(o, { editing, tier, kind, picked, workDirOverride, lineage, prompt }) {
  const base = {
    v: 1,
    id: null,
    role: o.role,
    lineage: { rebriefOf: lineage.prev?.id ?? null, reviewOf: lineage.target?.id ?? null },
  };
  if (picked.native) {
    return {
      ...base,
      status: "use_native",
      worker: { ...picked.native, tier, kind, skipped: picked.skipped ?? [] },
      isolation: null,
      fallbacks: [],
      promptPath: savePrompt(prompt),
      hint: nativeHint(picked.native.model),
    };
  }
  const iso = isolationFor(o, editing, picked.candidates);
  const skipped = [...(picked.skipped ?? []), ...iso.skipped];
  const [first, ...rest] = iso.candidates;
  if (!first) {
    return {
      ...base,
      status: "not_available",
      worker: { tier, kind, skipped },
      isolation: null,
      fallbacks: [],
      hint: picked.candidates.length ? IN_PLACE_ONLY_HINT : noRouteHint(skipped),
    };
  }
  return {
    ...base,
    status: "planned",
    worker: {
      modelId: first.modelId,
      route: first.route.id,
      harness: first.route.harness,
      model: first.route.model,
      family: first.family,
      tier,
      kind,
      skipped,
    },
    // "auto" works in place unless another in-place run holds the tree then.
    isolation: workDirOverride ? "worktree" : iso.isolation === "auto" ? "inplace" : iso.isolation,
    fallbacks: rest.map((c) => ({ modelId: c.modelId, route: c.route.id })),
    hint: "Nothing ran. Dispatch it without --plan.",
  };
}

// ---------- public commands ----------

export async function run(o) {
  const problem = G.gitProblem();
  if (problem) {
    throw new UsageError(problem);
  }
  const root = G.repoRoot(o.cwd);
  const cfg = load(root);
  const errors = validate(cfg, harnessNames);
  if (errors.length) {
    throw new UsageError(`config invalid:\n  ${errors.join("\n  ")}`);
  }
  if (!["scout", "fixer", "builder", "reviewer"].includes(o.role)) {
    throw new UsageError("--role must be scout, fixer, builder or reviewer");
  }
  if (o.isolation !== undefined && !["auto", "inplace", "worktree"].includes(o.isolation)) {
    throw new UsageError("--isolation must be auto, inplace or worktree");
  }
  const editing = EDITING.has(o.role);
  let allow = o.allow ?? [];
  let read = o.read ?? [];
  let brief = o.brief;
  let tier = o.tier;
  let excludeFamilies = [];
  let workDirOverride = null;
  let prev = null;
  let target = null;
  let diffCut = false;

  if (o.rebriefOf) {
    prev = loadMeta(o.rebriefOf);
    if (!prev) {
      throw new UsageError(`unknown run ${o.rebriefOf}`);
    }
    if (stillWorking(prev)) {
      throw new UsageError(workingHint(prev.id));
    }
    if (prev.retryUsed || prev.rebriefOf) {
      throw new UsageError("retry limit reached for this task: fix it yourself, drop it, or ask the user");
    }
    if (prev.applied) {
      throw new UsageError(`run ${prev.id} is applied; unapply it before rebriefing`);
    }
    if (!allow.length) {
      allow = prev.allow;
    }
    if (!read.length) {
      read = prev.read;
    }
    tier ??= prev.worker?.tier ? nextTier(prev.worker.tier) : undefined;
  }
  if (o.review) {
    target = loadMeta(o.review);
    if (!target) {
      throw new UsageError(`unknown run ${o.review}`);
    }
    if (o.role !== "reviewer") {
      throw new UsageError("--review requires --role reviewer");
    }
    if (stillWorking(target)) {
      throw new UsageError(workingHint(target.id));
    }
    const patchFile = path.join(runDir(target.id), "patch.diff");
    if (!target.files || !fs.existsSync(patchFile)) {
      throw new UsageError(`run ${target.id} has no change to review (status ${target.status})`);
    }
    if (target.worker?.family) {
      excludeFamilies = [target.worker.family];
    }
    read = [...new Set([...read, ...target.files.changed.map((c) => c.path)])];
    const whole = fs.readFileSync(patchFile, "utf8");
    diffCut = whole.length > REVIEW_DIFF_CAP;
    const diff = diffCut
      ? `${whole.slice(0, REVIEW_DIFF_CAP)}\n[diff cut at ${REVIEW_DIFF_CAP} of ${whole.length} characters: read the changed files for the rest]`
      : whole;
    brief = `${brief}\n\nORIGINAL TASK (what the change under review was asked to do; for reference, not for you to do)\n${target.brief}\n\nCHANGE UNDER REVIEW\n\`\`\`diff\n${diff}\n\`\`\``;
    if (target.isolation === "worktree" && !target.applied && fs.existsSync(target.worktree)) {
      workDirOverride = target.worktree;
    }
  }
  if (editing && !allow.length) {
    throw new UsageError(`${o.role} requires --allow`);
  }
  if (!brief?.trim()) {
    throw new UsageError("empty brief");
  }
  tier ??= cfg.roles?.[o.role]?.tier ?? "standard";
  const kind = o.kind ?? "code";
  const level = o.role === "builder" ? "full" : o.role === "fixer" ? "fast" : "none";
  const checkList = resolveChecks(root, level, cfg.project);
  const prompt = `${preamble({ role: o.role, allow, read, checks: checkList })}\n\n---\n\n${brief}`;
  const files = G.listFiles(root);
  const estimate = estimateTokens(root, files, [...allow, ...read], prompt);

  const picked = candidates(cfg, adapters, {
    tier,
    kind,
    model: o.model,
    excludeFamilies,
    estimate,
    pools: orchestratorPools(cfg, o.orchestrator),
    external: o.external,
  });

  if (o.plan) {
    return plan(o, { editing, tier, kind, picked, workDirOverride, lineage: { prev, target }, prompt });
  }

  const iso = picked.native ? null : isolationFor(o, editing, picked.candidates);
  const unavailable = !picked.native && !iso.candidates.length;

  // The new attempt starts from a tree without the previous one's change.
  if (prev && !unavailable && !prev.discarded) {
    const d = await discard(prev.id);
    if (d.status === "conflict") {
      throw new UsageError(d.hint);
    }
  }
  // Only once something runs it, here (set up) or natively, does a rebrief
  // use up the task's retry.
  const useRetry = () => {
    if (prev) {
      const p = loadMeta(prev.id);
      saveMeta(p.id, { ...p, retryUsed: true });
    }
  };

  const id = newRun();
  const meta = {
    id,
    role: o.role,
    root,
    editing,
    allow,
    read,
    brief: o.brief,
    tier,
    kind,
    rebriefOf: prev?.id ?? null,
    reviewOf: target?.id ?? null,
    retryUsed: !!prev && !unavailable,
    skipped: [...(picked.skipped ?? []), ...(iso?.skipped ?? [])],
    checkList,
    checkCmds: checkList.map((c) => c.cmd),
    pid: process.pid,
  };

  if (picked.native) {
    Object.assign(meta, {
      status: "use_native",
      isolation: null,
      phase: "done",
      worker: { ...picked.native, tier, kind, skipped: meta.skipped },
      promptPath: savePrompt(prompt),
      hint: nativeHint(picked.native.model),
    });
    saveMeta(id, meta);
    useRetry();
    return envelope(meta);
  }
  if (unavailable) {
    Object.assign(meta, {
      status: "not_available",
      isolation: null,
      phase: "done",
      worker: { tier, kind, skipped: meta.skipped },
      hint: picked.candidates.length ? IN_PLACE_ONLY_HINT : noRouteHint(meta.skipped),
    });
    saveMeta(id, meta);
    return envelope(meta);
  }
  let isolation = iso.isolation;
  if (isolation === "auto") {
    isolation = claimInplace(meta);
  } else if (isolation === "inplace" && editing && claimInplace(meta) !== "inplace") {
    // Asked for in place, but another editing run holds the tree.
    Object.assign(meta, { phase: "done", discarded: true });
    saveMeta(id, meta);
    throw new UsageError(
      `${busyTree(meta) ?? "Another in-place run holds this tree."} Or rerun with --isolation worktree.`,
    );
  }
  meta.isolation = workDirOverride ? "worktree" : isolation;
  meta.phase = "running";

  await serial(() => {
    const base = workDirOverride ?? root;
    meta.snap = G.snapshot(base, path.join(runDir(id), "snap.index"));
    if (workDirOverride) {
      meta.workDir = workDirOverride;
      meta.sharedWorkDir = true;
      return;
    }
    if (isolation === "worktree") {
      meta.worktree = path.join(runDir(id), "wt");
      G.addWorktree(root, meta.worktree, meta.snap);
      meta.gitFile = fs.readFileSync(path.join(meta.worktree, ".git"), "utf8");
      meta.linked = linkDeps(root, meta.worktree, findDepDirs(root));
      meta.copied = [];
      for (const f of cfg.project.copy ?? []) {
        const src = path.join(root, f);
        if (!fs.existsSync(src)) {
          continue;
        }
        const dst = path.join(meta.worktree, f);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        meta.copied.push(toPosix(f));
      }
      meta.workDir = meta.worktree;
    } else {
      meta.workDir = root;
    }
  });
  saveMeta(id, meta);
  useRetry();

  try {
    await execute(meta, cfg, iso.candidates, prompt, null);
  } catch (e) {
    throw interrupted(meta, e);
  } finally {
    meta.phase = meta.phase === "interrupted" ? meta.phase : "done";
    // Nothing to apply or discard later; the report is all there is.
    if (!editing && meta.worktree) {
      cleanupWorktree(meta);
      meta.discarded = true;
    }
    saveMeta(id, meta);
  }
  if (target) {
    // The reviewer ran in the target's worktree; don't treat its snapshot as ours.
    meta.isolation = target.isolation;
    if (diffCut) {
      const note = `The reviewer got the diff cut at ${REVIEW_DIFF_CAP} characters and was told to read the changed files for the rest; check that the report covers every file.`;
      meta.hint = [meta.hint, note].filter(Boolean).join(" ");
    }
    saveMeta(id, meta);
  }
  return envelope(meta);
}

// What a follow-up that fails to run hands back.
const FIRST_RESULT = ["status", "files", "checks", "denied", "notes", "summary", "hint", "post", "settled"];

export async function followup(id, brief) {
  const meta = loadMeta(id);
  if (!meta) {
    throw new UsageError(`unknown run ${id}`);
  }
  if (stillWorking(meta)) {
    throw new UsageError(workingHint(id));
  }
  if (meta.retryUsed || meta.rebriefOf) {
    throw new UsageError("retry limit reached for this task");
  }
  if (meta.applied || meta.discarded) {
    throw new UsageError("run is already applied or discarded");
  }
  if (!meta.sessionId) {
    throw new UsageError("no resumable session for this run; use --rebrief-of instead");
  }
  if (!["failed_checks", "ok", "no_changes", "blocked"].includes(meta.status)) {
    throw new UsageError(`cannot follow up a run with status ${meta.status}`);
  }
  const cfg = load(meta.root);
  const m = cfg.models[meta.worker.modelId];
  const route = m?.routes.find((r) => r.id === meta.worker.route);
  if (!route) {
    throw new UsageError("the route used by this run is no longer configured");
  }
  if (!brief?.trim()) {
    throw new UsageError("empty brief");
  }
  if (!fs.existsSync(meta.workDir)) {
    throw new UsageError("the tree this run worked in is gone (applied or discarded since); use --rebrief-of instead");
  }
  if (meta.isolation === "inplace") {
    const busy = busyTree(meta);
    if (busy) {
      throw new UsageError(busy);
    }
  }
  // The follow-up is judged against the original snapshot, so anything edited
  // since would count as the worker's change (and be restored if out of scope).
  const now = G.workingTree(meta.workDir, path.join(runDir(id), "now.index"));
  const settled = meta.settled ?? meta.post;
  if (now !== settled) {
    const ignore = [...(meta.linked ?? []), ...(meta.copied ?? [])];
    const edited = G.numstat(settled, now, meta.workDir)
      .map((c) => c.path)
      .filter((f) => !ignore.includes(f));
    if (edited.length) {
      throw new UsageError(
        `edited since the run: ${edited.slice(0, 10).join(", ")}; a follow-up would count these as the worker's changes. Apply or discard this run and use --rebrief-of instead.`,
      );
    }
  }
  // Should the follow-up fail to run, the tree goes back to this result and it stands.
  const first = Object.fromEntries(FIRST_RESULT.map((k) => [k, meta[k]]));
  meta.resetTo = settled;
  meta.retryUsed = true;
  meta.phase = "running";
  meta.pid = process.pid;
  // Until it finishes, the previous result is no longer the run's: a
  // follow-up that fails halfway must not leave it applicable.
  meta.status = null;
  meta.checks = [];
  meta.hint = null;
  meta.resetCopies = [];
  meta.gitFileRestored = false;
  saveMeta(id, meta);
  try {
    await execute(
      meta,
      cfg,
      [{ modelId: meta.worker.modelId, family: m.family, route, adapter: adapters[route.harness] }],
      brief,
      meta.sessionId,
    );
  } catch (e) {
    throw interrupted(meta, e);
  } finally {
    meta.phase = meta.phase === "interrupted" ? meta.phase : "done";
    delete meta.resetTo;
    if (meta.status === "harness_error" || meta.status === "not_available") {
      const why = meta.hint;
      Object.assign(meta, first);
      meta.hint = `The follow-up couldn't run (${why}); the tree is back to this result, still to decide. The retry is used.`;
    }
    saveMeta(id, meta);
  }
  return envelope(meta);
}

export function apply(id) {
  const meta = loadMeta(id);
  if (!meta) {
    throw new UsageError(`unknown run ${id}`);
  }
  if (meta.applied) {
    return envelope(meta);
  }
  if (meta.discarded) {
    throw new UsageError("run was discarded");
  }
  if (stillWorking(meta)) {
    return envelope(meta, { status: "conflict", hint: workingHint(id) });
  }
  if (!meta.editing || !APPLICABLE.has(meta.status)) {
    throw new UsageError(`cannot apply a run with status ${meta.status}`);
  }
  const files = meta.files.changed.map((c) => c.path);
  if (meta.isolation === "worktree") {
    const busy = busyTree(meta);
    if (busy) {
      return envelope(meta, { status: "conflict", hint: busy });
    }
    // Copied byte for byte, not patched: git apply converts line endings
    // through attributes (and crashes when told not to).
    const linked = throughLinks(meta.root, files);
    if (linked.length) {
      return envelope(meta, { status: "conflict", hint: linkHint(linked) });
    }
    const madeLinks = linksIn(meta.post, files, meta.root);
    if (madeLinks.length) {
      return envelope(meta, {
        status: "conflict",
        hint: `The worker made these symbolic links, which apply doesn't write: ${madeLinks.slice(0, 10).join(", ")}. Check where they point in \`dispatch diff ${id}\`, and make them yourself if they belong.`,
      });
    }
    const moved = foreignEdits(meta.root, meta.snap, meta.post, files);
    if (moved.length) {
      return envelope(meta, {
        status: "conflict",
        hint: `Changed in the working tree since the run started: ${moved.join(", ")}`,
      });
    }
    writeFrom(meta.root, meta.post, files);
    cleanupWorktree(meta);
  } else {
    const touched = differsFrom(meta.root, meta.post, files);
    if (touched.length) {
      return envelope(meta, { status: "conflict", hint: `Edited since the run: ${touched.join(", ")}` });
    }
  }
  meta.applied = true;
  saveMeta(id, meta);
  return envelope(meta);
}

export async function discard(id) {
  const meta = loadMeta(id);
  if (!meta) {
    throw new UsageError(`unknown run ${id}`);
  }
  if (meta.applied) {
    throw new UsageError("run is applied; use unapply");
  }
  if (meta.discarded) {
    return envelope(meta);
  }
  if (stillWorking(meta)) {
    return envelope(meta, { status: "conflict", hint: workingHint(id) });
  }
  if (meta.isolation === "worktree") {
    cleanupWorktree(meta);
  } else if (meta.editing && meta.phase !== "done" && meta.snap) {
    // Cut short (dispatch killed or failed): no result says what the worker
    // wrote, so every allowed file that differs from the start goes back.
    const busy = busyTree(meta);
    if (busy) {
      return envelope(meta, { status: "conflict", hint: busy });
    }
    const now = G.workingTree(meta.root, path.join(runDir(id), "discard.index"));
    const files = G.numstat(meta.snap, now, meta.root)
      .map((c) => c.path)
      .filter((f) => inScope(f, meta.allow));
    const linked = throughLinks(meta.root, files);
    if (linked.length) {
      return envelope(meta, { status: "conflict", hint: linkHint(linked) });
    }
    const copy = path.join(runDir(id), "discarded");
    for (const f of files) {
      if (fs.existsSync(path.join(meta.root, f))) {
        fs.mkdirSync(path.dirname(path.join(copy, f)), { recursive: true });
        fs.copyFileSync(path.join(meta.root, f), path.join(copy, f));
      }
    }
    writeFrom(meta.root, meta.snap, files);
    meta.hint = files.length
      ? `The run was cut short; restored the allowed files that differed from its start: ${files.slice(0, 10).join(", ")}. Their versions before this discard are in ${copy}.`
      : "The run was cut short; none of its allowed files differed from its start.";
  } else if (meta.editing && meta.post) {
    const busy = busyTree(meta);
    if (busy) {
      return envelope(meta, { status: "conflict", hint: busy });
    }
    const files = meta.files.changed.map((c) => c.path).filter((f) => !meta.files.outOfScope.includes(f));
    const linked = throughLinks(meta.root, files);
    if (linked.length) {
      return envelope(meta, { status: "conflict", hint: linkHint(linked) });
    }
    const touched = foreignEdits(meta.root, meta.post, meta.snap, files);
    if (touched.length) {
      return envelope(meta, { status: "conflict", hint: `Edited since the run, not restored: ${touched.join(", ")}` });
    }
    writeFrom(meta.root, meta.snap, files);
  }
  meta.discarded = true;
  saveMeta(id, meta);
  return envelope(meta);
}

export function unapply(id) {
  const meta = loadMeta(id);
  if (!meta) {
    throw new UsageError(`unknown run ${id}`);
  }
  if (!meta.applied) {
    throw new UsageError("run is not applied");
  }
  const busy = busyTree(meta);
  if (busy) {
    return envelope(meta, { status: "conflict", hint: busy });
  }
  // Applied, both isolations leave the worker's version in the tree.
  const files = meta.files.changed.map((c) => c.path);
  const linked = throughLinks(meta.root, files);
  if (linked.length) {
    return envelope(meta, { status: "conflict", hint: linkHint(linked) });
  }
  const touched = foreignEdits(meta.root, meta.post, meta.snap, files);
  if (touched.length) {
    return envelope(meta, { status: "conflict", hint: `Edited since the run: ${touched.join(", ")}` });
  }
  writeFrom(meta.root, meta.snap, files);
  meta.applied = false;
  meta.discarded = true;
  saveMeta(id, meta);
  return envelope(meta);
}

export function show(id) {
  const meta = loadMeta(id);
  if (!meta) {
    throw new UsageError(`unknown run ${id}`);
  }
  return envelope(meta);
}

export function diff(id) {
  const meta = loadMeta(id);
  if (!meta) {
    throw new UsageError(`unknown run ${id}`);
  }
  const f = path.join(runDir(id), "patch.diff");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
}

/**
 * Two tasks whose allowlists can reach the same file: an existing one both
 * match, or a path one names literally that the other matches. New files
 * behind two wildcards can't be foreseen.
 */
function overlappingTask(root, tasks) {
  const files = G.listFiles(root);
  const literal = (globs) => globs.filter((g) => !/[*?]/.test(g)).map((g) => toPosix(g).replace(/^\.\//, ""));
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i].allow ?? [];
      const b = tasks[j].allow ?? [];
      if (!a.length || !b.length) {
        continue;
      }
      const shared =
        a.find((g) => b.includes(g)) ??
        [...literal(a), ...literal(b), ...files].find((f) => matchAny(f, a) && matchAny(f, b));
      if (shared) {
        return `tasks ${i} and ${j} may both edit ${shared}; give each task its own files`;
      }
    }
  }
  return null;
}

export async function batch(tasks, { isolation, ...common }) {
  const cfg = load(G.repoRoot(common.cwd));
  const limit = Math.max(1, cfg.limits?.maxParallel ?? 4);
  const editingCount = tasks.filter((t) => EDITING.has(t.role)).length;
  // Editing tasks side by side, or beside other edits (native subagents), each get a worktree.
  const forceWorktree = editingCount > 1 || isolation === "worktree";
  const overlap = overlappingTask(G.repoRoot(common.cwd), tasks);
  if (overlap) {
    throw new UsageError(overlap);
  }
  // Planning checks a task without running it. An invalid task is refused
  // here, before the others run, rather than come back as a failed run.
  const planned = [];
  for (const [i, t] of tasks.entries()) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one after another: the first invalid task stops the batch.
      planned.push(await run({ ...common, ...t, forceWorktree, plan: true }));
    } catch (e) {
      throw e instanceof UsageError ? new UsageError(`task ${i}: ${e.message}`) : e;
    }
  }
  if (common.plan) {
    return { v: 1, batch: planned, totals: totalsOf(planned, true) };
  }
  const results = Array.from({ length: tasks.length });
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      try {
        // oxlint-disable-next-line no-await-in-loop -- each pool slot runs its tasks in turn; slots run in parallel.
        results[i] = await run({ ...common, ...tasks[i], forceWorktree });
      } catch (e) {
        results[i] = { v: 1, id: null, role: tasks[i].role, status: "harness_error", hint: String(e.message ?? e) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return { v: 1, batch: results, totals: totalsOf(results, false) };
}

function totalsOf(results, planned) {
  const totals = planned
    ? { planned: 0, use_native: 0, not_available: 0, other: 0 }
    : { ok: 0, failed_checks: 0, out_of_scope: 0, other: 0 };
  for (const r of results) {
    totals[r.status in totals ? r.status : "other"]++;
  }
  return totals;
}
