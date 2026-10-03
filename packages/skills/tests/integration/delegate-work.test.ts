import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for the delegate-work dispatcher: real git repositories
 * and run state in a temp dir, with a fake harness standing in for OpenCode.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.resolve(here, "../../drafts/delegate-work/scripts/lib/runner.mjs");
const state = path.resolve(here, "../../drafts/delegate-work/scripts/lib/state.mjs");
const proc = path.resolve(here, "../../drafts/delegate-work/scripts/lib/proc.mjs");
const adapter = (name: string) => path.resolve(here, `../../drafts/delegate-work/adapters/${name}.mjs`);

describe("delegate-work", () => {
  let tmp: string;
  let repo: string;
  const saved = { ...process.env };

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-work-"));
    repo = path.join(tmp, "repo");
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "a.txt"), "start\n");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    git("init", "-q");
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");

    // A harness is found by path; Windows runs a script through a .cmd shim.
    const fake = path.join(here, "fixtures", "fake-opencode.mjs");
    const bin = path.join(tmp, process.platform === "win32" ? "opencode.cmd" : "opencode");
    fs.writeFileSync(
      bin,
      process.platform === "win32" ? `@node "${fake}" %*\r\n` : `#!/bin/sh\nexec node "${fake}" "$@"\n`,
      { mode: 0o755 },
    );
    const config = {
      models: {
        fake: {
          family: "fake",
          context: 0,
          routes: [{ id: "fake-route", harness: "opencode", model: "fake/model", quotaPool: "fake-pool" }],
        },
      },
      tiers: { light: ["fake"] },
    };
    fs.writeFileSync(path.join(tmp, "workers.json"), JSON.stringify(config));
    Object.assign(process.env, {
      DELEGATE_WORK_CONFIG: path.join(tmp, "workers.json"),
      DELEGATE_WORK_STATE: path.join(tmp, "state"),
      DELEGATE_WORK_BIN_OPENCODE: bin,
    });
  });

  afterAll(() => {
    process.env = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("shouldKeepEachAttemptsLogWhenAFollowUpRunsInTheSameSession", async () => {
    const R = await import(runner);

    const first = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
    expect(first.status).toBe("ok");
    const firstLog = fs.readFileSync(first.logPath, "utf8");

    const second = await R.followup(first.id, "FOLLOW-UP: add another line.");
    expect(second.status).toBe("ok");
    expect(second.logPath).not.toBe(first.logPath);
    expect(fs.readFileSync(first.logPath, "utf8")).toBe(firstLog);
    expect(fs.readFileSync(path.join(repo, "src", "a.txt"), "utf8")).toBe("start\nfirst\nsecond\n");
  });

  it("shouldNumberAFollowUpsLogAfterTheHighestExistingOne", async () => {
    const R = await import(runner);

    const first = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
    const stray = path.join(path.dirname(first.logPath), "log-3.jsonl");
    fs.writeFileSync(stray, "kept\n");

    const second = await R.followup(first.id, "FOLLOW-UP: add another line.");
    expect(path.basename(second.logPath)).toBe("log-4.jsonl");
    expect(fs.readFileSync(stray, "utf8")).toBe("kept\n");
  });

  it("shouldReportAnIgnoredFileTheWorkerWroteOutsideItsAllowlist", async () => {
    const R = await import(runner);
    fs.writeFileSync(path.join(repo, ".gitignore"), "build/\n");

    const r = await R.run({
      cwd: repo,
      role: "fixer",
      allow: ["src/a.txt"],
      brief: "Add a line. WRITE-IGNORED",
      model: "fake",
    });
    expect(r.status).toBe("out_of_scope");
    expect(r.files.outOfScope).toContain("(invisible to git, not restored) build/out.txt");
    // Not in the snapshot, so a restore would have deleted it.
    expect(fs.existsSync(path.join(repo, "build", "out.txt"))).toBe(true);
    await R.discard(r.id);
    fs.rmSync(path.join(repo, "build"), { recursive: true });
    fs.rmSync(path.join(repo, ".gitignore"));
  });

  it("shouldPointOutReportedEditsTheWorkDirDoesNotShow", async () => {
    const R = await import(runner);

    const r = await R.run({
      cwd: repo,
      role: "fixer",
      allow: ["src/a.txt"],
      brief: "Add a line. REPORT-ONLY",
      model: "fake",
    });
    expect(r.status).toBe("no_changes");
    expect(r.hint).toContain("reported editing src/a.txt, but the work dir doesn't show them changed");
  });

  it("shouldNotRunTheRepositorysGitHooks", async () => {
    const R = await import(runner);
    const sentinel = path.join(tmp, "hook-ran");
    const hooks = path.join(repo, ".githooks");
    fs.mkdirSync(hooks);
    // Git runs post-index-change whenever it writes an index: every snapshot.
    fs.writeFileSync(
      path.join(hooks, "post-index-change"),
      `#!/bin/sh\necho ran > "${sentinel.replaceAll("\\", "/")}"\n`,
      { mode: 0o755 },
    );
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    git("config", "core.hooksPath", ".githooks");

    try {
      const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
      expect(r.status).toBe("ok");
      expect(fs.existsSync(sentinel)).toBe(false);
      await R.discard(r.id);
    } finally {
      git("config", "--unset", "core.hooksPath");
      fs.rmSync(hooks, { recursive: true });
    }
  });

  it("shouldRefuseToActOnARunThatIsStillWorking", async () => {
    const R = await import(runner);
    const S = await import(state);

    const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
    const meta = S.loadMeta(r.id);
    // As a follow-up in another dispatch process leaves it while it works.
    S.saveMeta(r.id, { ...meta, phase: "running", pid: process.pid });
    try {
      expect(R.apply(r.id).status).toBe("conflict");
      expect((await R.discard(r.id)).status).toBe("conflict");
      await expect(
        R.run({ cwd: repo, rebriefOf: r.id, role: "fixer", brief: "Better.", model: "fake" }),
      ).rejects.toThrow(`Run ${r.id} is still working`);
      await expect(R.followup(r.id, "More.")).rejects.toThrow("still working");
    } finally {
      S.saveMeta(r.id, meta);
    }
    expect((await R.discard(r.id)).status).toBe("ok");
  });

  it("shouldNotDiscardAStillRunningCheckAfterDispatchFailsInternally", async () => {
    const R = await import(runner);
    const S = await import(state);
    const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
    const meta = S.loadMeta(r.id);
    S.saveMeta(r.id, { ...meta, phase: "interrupted", checkPid: process.pid, checkStarted: Date.now() });
    try {
      expect((await R.discard(r.id)).status).toBe("conflict");
    } finally {
      S.saveMeta(r.id, meta);
      await R.discard(r.id);
    }
  });

  it("shouldRefuseAnInPlaceRunWhileAnotherHoldsTheTree", async () => {
    const R = await import(runner);
    const S = await import(state);
    const fixer = { cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" };

    const first = await R.run(fixer);
    const { root } = S.loadMeta(first.id);
    await R.discard(first.id);
    const holder = S.newRun();
    const held = { id: holder, root, editing: true, isolation: "inplace", phase: "running", pid: process.pid };
    S.saveMeta(holder, { ...held, claimedAt: 0 });
    try {
      await expect(R.run({ ...fixer, isolation: "inplace" })).rejects.toThrow(
        `In-place run ${holder} is still working in this tree`,
      );
    } finally {
      S.saveMeta(holder, { ...held, phase: "done" });
    }
  });

  it("shouldRestoreAnOutOfScopeFileWhoseNameStartsWithAParenthesis", async () => {
    const R = await import(runner);
    const ledger = path.join(repo, "(ledger).txt");
    fs.writeFileSync(ledger, "kept\n");

    try {
      const r = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt"],
        brief: "Add a line. ALSO-WRITE (ledger).txt",
        model: "fake",
      });
      expect(r.status).toBe("out_of_scope");
      expect(r.files.outOfScope).toContain("(ledger).txt");
      expect(fs.readFileSync(ledger, "utf8")).toBe("kept\n");
      await R.discard(r.id);
    } finally {
      fs.rmSync(ledger, { force: true });
    }
  });

  it("shouldCountAnEditOutsideTheTreeAsOutOfScopeWhateverTheAllowlist", async () => {
    const R = await import(runner);
    const outside = path.join(tmp, "outside.txt");

    try {
      const r = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["**"],
        brief: "Add a line. ALSO-WRITE ../outside.txt",
        model: "fake",
      });
      expect(r.status).toBe("out_of_scope");
      expect(r.files.outOfScope).toContain("(invisible to git, not restored) ../outside.txt");
      await R.discard(r.id);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it("shouldTellTheReviewerAndTheOrchestratorWhenTheDiffWasCut", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    // A reviewer from another family than the fixer's.
    config.models.other = { ...config.models.fake, family: "other" };
    config.tiers.light = ["fake", "other"];
    fs.writeFileSync(configFile, JSON.stringify(config));

    try {
      const fixed = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt", "src/big.txt"],
        brief: "Add a line. BIG-DIFF",
        model: "fake",
      });
      expect(fixed.status).toBe("ok");
      const review = await R.run({ cwd: repo, role: "reviewer", review: fixed.id, tier: "light", brief: "SHORT" });
      expect(review.worker.modelId).toBe("other");
      expect(review.report).toMatch(/\(diff was cut\)$/);
      expect(review.hint).toContain("diff cut at 60000 characters");
      await R.discard(fixed.id);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldPlanABatchWithoutRunningIt", async () => {
    const R = await import(runner);
    const runs = path.join(process.env.DELEGATE_WORK_STATE as string, "runs");
    const before = fs.readdirSync(runs);
    const task = { role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" };

    const r = await R.batch([task, { ...task, allow: ["src/b.txt"] }], { cwd: repo, plan: true });
    expect(r.batch.map((t: { status: string }) => t.status)).toEqual(["planned", "planned"]);
    expect(r.batch[0].worker.route).toBe("fake-route");
    // Two editing tasks get worktrees.
    expect(r.batch[0].isolation).toBe("worktree");
    expect(r.totals).toEqual({ planned: 2, use_native: 0, not_available: 0, other: 0 });
    expect(fs.readdirSync(runs)).toEqual(before);
  });

  it("shouldRefuseABatchWithAnInvalidTaskBeforeRunningAny", async () => {
    const R = await import(runner);
    const runs = path.join(process.env.DELEGATE_WORK_STATE as string, "runs");
    const before = fs.readdirSync(runs);
    const good = { role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" };

    await expect(R.batch([good, { ...good, allow: [] }], { cwd: repo })).rejects.toThrow(
      "task 1: fixer requires --allow",
    );
    expect(fs.readdirSync(runs)).toEqual(before);
  });

  it("shouldRefuseABatchWhoseAllowlistsOverlap", async () => {
    const R = await import(runner);
    const task = (allow: string[]) => ({ role: "fixer", allow, brief: "Edit.", model: "fake" });

    // An existing file both patterns match.
    await expect(R.batch([task(["src/a.txt"]), task(["src/*.txt"])], { cwd: repo, plan: true })).rejects.toThrow(
      "tasks 0 and 1 may both edit src/a.txt",
    );
    // A new file one task names and the other's pattern covers.
    await expect(R.batch([task(["src/new.ts"]), task(["src/**"])], { cwd: repo, plan: true })).rejects.toThrow(
      "may both edit src/new.ts",
    );
    const ok = await R.batch([task(["src/a.txt"]), task(["src/b.txt"])], { cwd: repo, plan: true });
    expect(ok.totals.planned).toBe(2);
  });

  it("shouldReportNoRetryLeftWhenARebriefGoesNative", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");

    const first = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
    // The fake model now belongs to the orchestrator's own pool.
    fs.writeFileSync(
      configFile,
      JSON.stringify({ ...JSON.parse(original), orchestrators: { test: { pools: ["fake-pool"] } } }),
    );
    const rebrief = (tier: string) =>
      R.run({ cwd: repo, rebriefOf: first.id, role: "fixer", brief: "Better.", orchestrator: "test", tier });
    try {
      // Nothing configured for the tier: nothing runs, the retry stays.
      const none = await rebrief("strong");
      expect(none.status).toBe("not_available");
      // Not for the rebrief itself, though: it was the task's retry.
      expect(none.retryAvailable).toBe(false);
      const r = await rebrief("light");
      expect(r.status).toBe("use_native");
      expect(r.retryAvailable).toBe(false);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldInheritTheRoleWhenRebriefingWithoutAnExplicitRole", async () => {
    const R = await import(runner);
    const first = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });

    const result = spawnSync(
      process.execPath,
      [path.resolve(runner, "../../dispatch.mjs"), "run", "--rebrief-of", first.id, "--model", "fake", "--brief", "-"],
      { cwd: repo, input: "Better brief.", encoding: "utf8", env: process.env },
    );
    if (result.status !== 0) {
      throw new Error(`rebrief failed: ${result.stderr}`);
    }
    expect(result.status).toBe(0);
    const rebrief = JSON.parse(result.stdout);
    expect(rebrief.role).toBe("fixer");
    expect(rebrief.lineage.rebriefOf).toBe(first.id);
    await R.discard(rebrief.id);
  });

  it("shouldRejectChecksThatChangeGitVisibleFilesBeforeApply", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    config.projects = {
      [`${repo.replaceAll("\\", "/")}/**`]: {
        checks: {
          fast: ["node -e \"require('fs').writeFileSync('src/a.txt', 'modified by checks\\n')\""],
        },
      },
    };
    fs.writeFileSync(configFile, JSON.stringify(config));
    const before = fs.readFileSync(path.join(repo, "src/a.txt"), "utf8");

    try {
      const result = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt"],
        brief: "Add a line.",
        model: "fake",
        isolation: "worktree",
      });
      expect(result.checks[0].ok).toBe(true);
      expect(result.status).toBe("out_of_scope");
      expect(result.files.outOfScope).toEqual(expect.arrayContaining([expect.stringContaining("checks changed")]));
      expect(() => R.apply(result.id)).toThrow("cannot apply");
      await R.discard(result.id);
      expect(fs.readFileSync(path.join(repo, "src/a.txt"), "utf8")).toBe(before);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldRestoreCheckEditsInPlaceSoTheRunCanBeDiscarded", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    config.projects = {
      [`${repo.replaceAll("\\", "/")}/**`]: {
        checks: { fast: ["node -e \"require('fs').writeFileSync('src/a.txt', 'modified by checks\\n')\""] },
      },
    };
    fs.writeFileSync(configFile, JSON.stringify(config));
    const file = path.join(repo, "src/a.txt");
    const before = fs.readFileSync(file, "utf8");

    try {
      const result = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt"],
        brief: "Add a line.",
        model: "fake",
      });
      expect(result.status).toBe("out_of_scope");
      expect(fs.readFileSync(file, "utf8")).toBe(`${before}first\n`);
      const discarded = await R.discard(result.id);
      expect(discarded.status).toBe("out_of_scope");
      expect(fs.readFileSync(file, "utf8")).toBe(before);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldStartAReviewWithItsVerdictOnlyWhenItIsAKnownOne", async () => {
    const R = await import(runner);
    const review = (brief: string) => R.run({ cwd: repo, role: "reviewer", brief, model: "fake" });

    const good = await review("Review. SHORT VERDICT approve-with-nits");
    expect(good.report).toBe("verdict: approve-with-nits\none finding");
    expect(good.hint).toBeNull();

    const odd = await review("Review. SHORT VERDICT looks-fine");
    expect(odd.report).toBe("one finding");
    expect(odd.hint).toContain("no valid verdict");
  });

  it("shouldKeepAnAnswerWrittenAboveTheResultBlock", async () => {
    const R = await import(runner);

    const r = await R.run({ cwd: repo, role: "scout", brief: "Answer. ABOVE", model: "fake" });
    expect(r.report).toMatch(/^the answer\n/);
    expect(r.report).toMatch(/\n\nFindings are listed above\.$/);
    // A full report stays as the worker wrote it.
    const full = await R.run({ cwd: repo, role: "scout", brief: "Answer. SHORT", model: "fake" });
    expect(full.report).toBe("one finding");
  });

  it("shouldKeepTheWholeReportWhenTheResultCutsIt", async () => {
    const R = await import(runner);

    const r = await R.run({ cwd: repo, role: "scout", brief: "Map the code.", model: "fake" });
    expect(r.status).toBe("ok");
    expect(r.report.length).toBe(4000);
    expect(r.reportTruncated).toBe(true);
    expect(fs.readFileSync(r.reportPath, "utf8")).toMatch(/end of report$/);
  });

  it("shouldNotRestoreThroughALinkTheWorkerMade", async () => {
    const R = await import(runner);
    const outside = path.join(tmp, "outside");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "keep.txt"), "keep\n");

    const r = await R.run({
      cwd: repo,
      role: "fixer",
      allow: ["src/a.txt"],
      brief: `Add a line. MAKE-LINK ${outside}`,
      model: "fake",
    });
    expect(r.status).toBe("out_of_scope");
    // Git walks into a junction (Windows) and records a symlink (elsewhere).
    expect(r.hint).toContain("Not written, their path goes through a link: src/j");
    expect(fs.readFileSync(path.join(outside, "keep.txt"), "utf8")).toBe("keep\n");
    fs.unlinkSync(path.join(repo, "src", "j"));
    await R.discard(r.id);
  });

  it("shouldCopyWhatAnInPlaceResetRestoresBeforeTheNextRoute", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    config.models.fake.routes.unshift({
      id: "broken-route",
      harness: "opencode",
      model: "fake/broken",
      quotaPool: "broken-pool",
    });
    fs.writeFileSync(configFile, JSON.stringify(config));
    const before = fs.readFileSync(path.join(repo, "src", "a.txt"), "utf8");

    try {
      const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
      expect(r.status).toBe("ok");
      expect(r.worker.route).toBe("fake-route");
      const copy = r.hint.match(/copied first to (\S+?)\.$/)[1];
      expect(fs.readFileSync(path.join(copy, "src", "a.txt"), "utf8")).toBe(`${before}first\n`);
      expect(fs.readFileSync(path.join(repo, "src", "a.txt"), "utf8")).toBe(`${before}first\n`);
      await R.discard(r.id);
    } finally {
      fs.writeFileSync(configFile, original);
      fs.rmSync(path.join(process.env.DELEGATE_WORK_STATE as string, "cooldowns.json"), { force: true });
    }
  });

  it("shouldStopPnpmInstallingBeforeScriptsInWorkersAndChecks", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    config.projects = {
      [`${repo.replaceAll("\\", "/")}/**`]: {
        checks: {
          fast: ["node -e \"process.exit(process.env.pnpm_config_verify_deps_before_run === 'false' ? 0 : 1)\""],
        },
      },
    };
    fs.writeFileSync(configFile, JSON.stringify(config));

    try {
      const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
      expect(r.summary).toContain("pnpm_config_verify_deps_before_run=false");
      expect(r.checks).toEqual([{ name: "check1", ok: true, tail: "" }]);
      await R.discard(r.id);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldKeepSecretsFromWorkersAndChecksUnlessPassed", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    // Fails when the checks can see the stripped variable.
    config.projects = {
      [`${repo.replaceAll("\\", "/")}/**`]: {
        passEnv: ["DW_PASSED_*"],
        checks: { fast: ['node -e "process.exit(process.env.DW_TOKEN ? 1 : 0)"'] },
      },
    };
    fs.writeFileSync(configFile, JSON.stringify(config));
    Object.assign(process.env, { DW_TOKEN: "secret", DW_PASSED_TOKEN: "passed", DW_PLAIN: "plain" });

    try {
      const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
      expect(r.summary).toContain("DW_TOKEN=unset DW_PASSED_TOKEN=passed DW_PLAIN=plain");
      expect(r.checks).toEqual([{ name: "check1", ok: true, tail: "" }]);
      await R.discard(r.id);
    } finally {
      fs.writeFileSync(configFile, original);
      for (const k of ["DW_TOKEN", "DW_PASSED_TOKEN", "DW_PLAIN"]) {
        delete process.env[k];
      }
    }
  });

  it("shouldStripPasswordsInAnyNameFormButKeepTheWorkingDirectory", async () => {
    const { withoutSecrets } = await import(proc);
    const env = {
      PGPASSWORD: "x",
      MYSQL_PWD: "x",
      REDIS_URL: "redis://:password@localhost:6379",
      OLDPWD: "/previous",
      DW_PLAIN_URL: "https://example.com/path",
    };
    Object.assign(process.env, env);

    try {
      const stripped = Object.keys(withoutSecrets([]));
      expect(stripped).toEqual(expect.arrayContaining(["PGPASSWORD", "MYSQL_PWD", "REDIS_URL"]));
      expect(stripped).not.toContain("PWD");
      expect(stripped).not.toContain("OLDPWD");
      expect(stripped).not.toContain("DW_PLAIN_URL");
    } finally {
      for (const k of Object.keys(env)) {
        if (saved[k] === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = saved[k];
        }
      }
    }
  });

  it.skipIf(process.platform !== "win32")(
    "shouldNotRunAGitPlantedInTheWorkingDirectory",
    () => {
      const dir = path.join(tmp, "planted");
      fs.mkdirSync(dir, { recursive: true });
      // Node answers `git --version` with its own version: a planted git.exe.
      fs.copyFileSync(process.execPath, path.join(dir, "git.exe"));
      // Set by some hosts (Claude Code), not by a plain shell; its case varies.
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([k]) => k.toLowerCase() !== "nodefaultcurrentdirectoryinexepath"),
      );

      const out = execFileSync(process.execPath, [path.resolve(runner, "../../dispatch.mjs"), "doctor"], {
        cwd: dir,
        env,
        encoding: "utf8",
      });
      expect(JSON.parse(out).git.version).toMatch(/^git version/);
      // doctor probes every harness installed here.
    },
    60000,
  );

  it("shouldReadAResultBlockWrittenWithMarkdown", async () => {
    const { parseResult } = await import(path.resolve(runner, "../result.mjs"));

    const bold = parseResult("RESULT\n**status:** blocked\n**summary:** no access\n**verdict:** reject");
    expect(bold).toMatchObject({ status: "blocked", summary: "no access", verdict: "reject" });
    expect(parseResult("RESULT\nstatus: **done**\nverdict: `approve`")).toMatchObject({
      status: "done",
      verdict: "approve",
    });
    expect(parseResult("RESULT\nstatus: _not_needed_").status).toBe("not_needed");
    expect(parseResult("RESULT\nstatus: not_needed | done").status).toBe("not_needed");
  });

  it("shouldKeepTheFirstResultWhenAFollowUpCannotRun", async () => {
    const R = await import(runner);
    const a = path.join(repo, "src", "a.txt");

    const first = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
    const kept = fs.readFileSync(a, "utf8");
    try {
      const second = await R.followup(first.id, "FOLLOW-UP BREAK: add another line.");
      expect(second.status).toBe("ok");
      expect(second.files.changed.map((c: { path: string }) => c.path)).toEqual(["src/a.txt"]);
      expect(second.hint).toContain("The follow-up couldn't run");
      expect(second.retryAvailable).toBe(false);
      expect(fs.readFileSync(a, "utf8")).toBe(kept);
      expect(R.apply(first.id).applied).toBe(true);
      R.unapply(first.id);
    } finally {
      fs.rmSync(path.join(process.env.DELEGATE_WORK_STATE as string, "cooldowns.json"), { force: true });
    }
  });

  it("shouldRestoreTheAllowedFilesOfARunThatWasCutShort", async () => {
    const R = await import(runner);
    const S = await import(state);
    const { prune } = await import(path.resolve(runner, "../prune.mjs"));
    const a = path.join(repo, "src", "a.txt");
    const before = fs.readFileSync(a, "utf8");

    const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
    // As a dispatch killed halfway leaves it: running, its process gone, no result.
    const gone = spawnSync(process.execPath, ["-e", ""]).pid;
    const meta = S.loadMeta(r.id);
    S.saveMeta(r.id, { ...meta, phase: "running", pid: gone, workerPid: null, post: undefined, status: undefined });
    fs.appendFileSync(a, "half\n");

    const listed = prune({ maxAgeMs: Infinity, dryRun: true }).kept.find((k: { id: string }) => k.id === r.id);
    expect(listed.reason).toContain("interrupted; partial edits may be in the working tree");
    // Its worker outliving dispatch still counts as working.
    S.saveMeta(r.id, { ...S.loadMeta(r.id), workerPid: process.pid, workerStarted: Date.now() });
    expect((await R.discard(r.id)).hint).toContain("dispatch stopped, but its worker");
    S.saveMeta(r.id, { ...S.loadMeta(r.id), workerPid: null });
    const d = await R.discard(r.id);
    expect(d.status).toBeNull();
    expect(fs.readFileSync(a, "utf8")).toBe(before);
    expect(d.hint).toContain("restored the allowed files that differed from its start: src/a.txt");
    const copy = d.hint.match(/are in (\S+?)\.$/)[1];
    expect(fs.readFileSync(path.join(copy, "src", "a.txt"), "utf8")).toBe(`${before}first\nhalf\n`);
    expect(prune({ maxAgeMs: Infinity, dryRun: true }).kept.map((k: { id: string }) => k.id)).not.toContain(r.id);
  });

  it("shouldRefuseDiscardWhileACheckSurvivesAForceKilledDispatch", async () => {
    const R = await import(runner);
    const S = await import(state);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const started = path.join(tmp, "check-started");
    const gate = path.join(tmp, "check-release");
    const finished = path.join(tmp, "check-finished");
    const checkScript = path.join(tmp, "long-check.cjs");
    fs.writeFileSync(
      checkScript,
      `const fs = require("node:fs");\nfs.writeFileSync(${JSON.stringify(started)}, String(process.pid));\nconst timer = setInterval(() => { if (!fs.existsSync(${JSON.stringify(gate)})) return; clearInterval(timer); fs.appendFileSync("src/a.txt", "late\\n"); fs.writeFileSync(${JSON.stringify(finished)}, "done"); }, 25);\n`,
    );
    const config = JSON.parse(original);
    config.projects = { [`${repo.replaceAll("\\", "/")}/**`]: { checks: { fast: [`node "${checkScript}"`] } } };
    fs.writeFileSync(configFile, JSON.stringify(config));
    const dispatch = path.resolve(runner, "../../dispatch.mjs");
    const before = fs.readFileSync(path.join(repo, "src", "a.txt"), "utf8");
    const child = spawn(
      process.execPath,
      [dispatch, "run", "--role", "fixer", "--allow", "src/a.txt", "--model", "fake", "--brief", "-"],
      {
        cwd: repo,
        env: process.env,
        stdio: ["pipe", "ignore", "pipe"],
      },
    );
    child.stdin.end("Add a line.");
    const waitFor = async (predicate: () => boolean) => {
      const deadline = Date.now() + 10000;
      while (!predicate()) {
        if (Date.now() > deadline) {
          throw new Error("timed out waiting for check process");
        }
        // oxlint-disable-next-line no-await-in-loop -- polls for check process lifecycle events.
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
    };

    try {
      await waitFor(() => fs.existsSync(started));
      const meta = fs
        .readdirSync(S.runsDir())
        .map(S.loadMeta)
        .find((entry: { pid: number }) => entry?.pid === child.pid);
      expect(meta).toBeDefined();
      expect(meta.checkPid).toBeTruthy();
      expect(S.alive(meta.checkPid)).toBe(true);
      const checkChildPid = Number(fs.readFileSync(started, "utf8"));
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => child.on("close", () => resolve()));
      expect(S.loadMeta(meta.id).checkPid).toBe(meta.checkPid);
      expect(S.alive(checkChildPid)).toBe(true);
      const refused = await R.discard(meta.id);
      expect(refused.status).toBe("conflict");
      expect(refused.hint).toContain("dispatch stopped, but its check");
      const { prune } = await import(path.resolve(runner, "../prune.mjs"));
      expect(prune({ maxAgeMs: 0, dryRun: true }).kept.map((entry: { id: string }) => entry.id)).toContain(meta.id);
      fs.writeFileSync(gate, "continue");
      await waitFor(() => fs.existsSync(finished));
      await waitFor(() => !S.alive(checkChildPid));
      await waitFor(() => !S.working(S.loadMeta(meta.id)));
      // Its last write landed before discard, which restores it with the rest.
      const d = await R.discard(meta.id);
      expect(d.status).toBeNull();
      expect(d.hint).toContain("restored the allowed files");
      expect(fs.readFileSync(path.join(repo, "src", "a.txt"), "utf8")).toBe(before);
    } finally {
      child.kill("SIGKILL");
      fs.writeFileSync(gate, "continue");
      if (fs.existsSync(started)) {
        await waitFor(() => fs.existsSync(finished));
        const checkPid = Number(fs.readFileSync(started, "utf8"));
        await waitFor(() => !S.alive(checkPid));
      }
      fs.writeFileSync(configFile, original);
      for (const file of [started, gate, finished, checkScript]) {
        fs.rmSync(file, { force: true });
      }
    }
  }, 20000);

  it("shouldRefuseDiscardWhileAWorkerSurvivesAForceKilledDispatch", async () => {
    const R = await import(runner);
    const S = await import(state);
    const gate = path.join(tmp, "worker-release");
    const started = `${gate}.started`;
    const before = fs.readFileSync(path.join(repo, "src", "a.txt"), "utf8");
    // On Windows the worker runs through a .cmd shim, which dies with dispatch while the worker goes on.
    const dispatch = path.resolve(runner, "../../dispatch.mjs");
    const child = spawn(
      process.execPath,
      [dispatch, "run", "--role", "fixer", "--allow", "src/a.txt", "--model", "fake", "--brief", "-"],
      { cwd: repo, env: process.env, stdio: ["pipe", "ignore", "ignore"] },
    );
    child.stdin.end(`Add a line. HOLD ${gate.replaceAll("\\", "/")}`);
    const waitFor = async (predicate: () => boolean) => {
      const deadline = Date.now() + 10000;
      while (!predicate()) {
        if (Date.now() > deadline) {
          throw new Error("timed out waiting for the worker");
        }
        // oxlint-disable-next-line no-await-in-loop -- polls for the worker's lifecycle.
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
    };

    try {
      await waitFor(() => fs.existsSync(started));
      const worker = Number(fs.readFileSync(started, "utf8"));
      const meta = fs
        .readdirSync(S.runsDir())
        .map(S.loadMeta)
        .find((entry: { pid: number }) => entry?.pid === child.pid);
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => child.on("close", () => resolve()));
      expect(S.alive(worker)).toBe(true);
      const refused = await R.discard(meta.id);
      expect(refused.status).toBe("conflict");
      expect(refused.hint).toContain("dispatch stopped, but its worker");
      fs.writeFileSync(gate, "continue");
      await waitFor(() => !S.alive(worker));
      await waitFor(() => !S.working(S.loadMeta(meta.id)));
      const d = await R.discard(meta.id);
      expect(d.status).toBeNull();
      expect(fs.readFileSync(path.join(repo, "src", "a.txt"), "utf8")).toBe(before);
    } finally {
      child.kill("SIGKILL");
      fs.writeFileSync(gate, "continue");
      if (fs.existsSync(started)) {
        const worker = Number(fs.readFileSync(started, "utf8"));
        await waitFor(() => !S.alive(worker));
      }
      for (const file of [started, gate]) {
        fs.rmSync(file, { force: true });
      }
    }
  }, 20000);

  it.skipIf(process.platform === "win32")("shouldRestoreAnExecutableFileAsExecutable", async () => {
    const R = await import(runner);
    const tool = path.join(repo, "tool.sh");
    fs.writeFileSync(tool, "#!/bin/sh\n", { mode: 0o755 });

    try {
      const r = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt"],
        brief: "Add a line. DELETE tool.sh",
        model: "fake",
      });
      expect(r.status).toBe("out_of_scope");
      expect(fs.statSync(tool).mode & 0o111).toBe(0o111);
      await R.discard(r.id);
    } finally {
      fs.rmSync(tool, { force: true });
    }
  });

  it.skipIf(process.platform === "win32")("shouldTakeABackslashAsPartOfAFileName", async () => {
    const { matchAny } = await import(path.resolve(runner, "../glob.mjs"));

    expect(matchAny("src\\victim.ts", ["src/**"])).toBe(false);
    expect(matchAny("src/victim.ts", ["src/**"])).toBe(true);
  });

  it("shouldListAnInPlaceResultLeftUndiscarded", async () => {
    const R = await import(runner);
    const { prune } = await import(path.resolve(runner, "../prune.mjs"));

    const r = await R.run({
      cwd: repo,
      role: "fixer",
      allow: ["src/a.txt"],
      brief: "Add a line. ALSO-WRITE src/stray.txt",
      model: "fake",
    });
    expect(r.status).toBe("out_of_scope");
    const listed = prune({ maxAgeMs: Infinity, dryRun: true }).kept.find((k: { id: string }) => k.id === r.id);
    expect(listed.reason).toContain("out_of_scope, not discarded: its edits are still in the working tree");
    expect(R.show(r.id)).toMatchObject({ id: r.id, status: "out_of_scope" });
    await R.discard(r.id);
  });

  it("shouldRefuseAFollowUpWhileAnotherRunHoldsTheTree", async () => {
    const R = await import(runner);
    const S = await import(state);

    const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
    const holder = S.newRun();
    const held = { id: holder, root: S.loadMeta(r.id).root, editing: true, isolation: "inplace", pid: process.pid };
    S.saveMeta(holder, { ...held, phase: "running" });
    try {
      await expect(R.followup(r.id, "FOLLOW-UP: more.")).rejects.toThrow(`In-place run ${holder} is still working`);
    } finally {
      S.saveMeta(holder, { ...held, phase: "done" });
    }
    await R.discard(r.id);
  });

  it("shouldGiveANativeTaskItsBriefWithTheWorkerRules", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    fs.writeFileSync(
      configFile,
      JSON.stringify({ ...JSON.parse(original), orchestrators: { test: { pools: ["fake-pool"] } } }),
    );
    const task = { cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", orchestrator: "test" };

    try {
      const r = await R.run(task);
      expect(r.status).toBe("use_native");
      const prompt = fs.readFileSync(r.promptPath, "utf8");
      expect(prompt).toContain("Edit only the files you are allowed to edit: src/a.txt");
      expect(prompt).toMatch(/Add a line\.$/);
      // A plan names the same prompt.
      expect((await R.run({ ...task, plan: true })).promptPath).toBe(r.promptPath);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldSayWhyNoRouteCouldRun", async () => {
    const R = await import(runner);

    const fixed = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
    // The only model is the fixer's own family.
    const review = await R.run({ cwd: repo, role: "reviewer", review: fixed.id, tier: "light", brief: "Review." });
    expect(review.status).toBe("not_available");
    expect(review.hint).toContain("fake (same family as reviewed work (fake))");
    await R.discard(fixed.id);
  });

  it("shouldGiveABatchsEditingTaskAWorktreeWhenAsked", async () => {
    const R = await import(runner);
    const task = { role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" };

    const r = await R.batch([task, { role: "scout", brief: "Look.", model: "fake" }], {
      cwd: repo,
      plan: true,
      isolation: "worktree",
    });
    expect(r.batch.map((t: { isolation: string }) => t.isolation)).toEqual(["worktree", "inplace"]);
  });

  it("shouldRunAModelTheConfigDoesntListOnlyOnTheHarnessNamed", async () => {
    const R = await import(runner);
    const scout = { cwd: repo, role: "scout", brief: "Look.", plan: true };

    const unknown = await R.run({ ...scout, model: "fake/model-2" });
    expect(unknown.status).toBe("not_available");
    expect(unknown.hint).toContain("give --harness");
    // Pool and family come from the configured route of the same model line.
    const adhoc = await R.run({ ...scout, model: "fake/model-2", harness: "opencode" });
    expect(adhoc.worker).toMatchObject({ route: "adhoc", model: "fake/model-2", family: "fake" });
    const unlisted = await R.run({ ...scout, model: "fake/nope", harness: "opencode" });
    expect(unlisted.hint).toContain("opencode doesn't list this model");
  });

  it("shouldRunExternallyOnTheHarnessAndEffortNamed", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    fs.writeFileSync(
      configFile,
      JSON.stringify({ ...JSON.parse(original), orchestrators: { test: { pools: ["fake-pool"] } } }),
    );
    const scout = { cwd: repo, role: "scout", brief: "Look.", plan: true, orchestrator: "test" };

    try {
      expect((await R.run(scout)).status).toBe("use_native");
      // A native subagent takes neither a harness nor an effort level.
      const high = await R.run({ ...scout, harness: "opencode", effort: "high" });
      expect(high.status).toBe("planned");
      expect(high.worker).toMatchObject({ modelId: "fake", effort: "high" });
      const none = await R.run({ ...scout, harness: "codex" });
      expect(none.status).toBe("not_available");
      expect(none.hint).toContain("fake (no codex route)");
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldKeepTheOverridesOnARebriefWithoutEscalating", async () => {
    const R = await import(runner);
    const fixer = { cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line." };

    const first = await R.run({ ...fixer, model: "fake", effort: "low" });
    expect(first.worker.effort).toBe("low");
    const again = await R.run({ cwd: repo, rebriefOf: first.id, brief: "Better.", plan: true });
    expect(again.worker).toMatchObject({ modelId: "fake", tier: "light", effort: "low" });
    // A tier routes by tier again, one the config leaves empty here.
    const byTier = await R.run({ cwd: repo, rebriefOf: first.id, brief: "Better.", tier: "strong", plan: true });
    expect(byTier.status).toBe("not_available");
    await R.discard(first.id);
  });

  it("shouldFollowUpOnTheRouteTheRunUsed", async () => {
    const R = await import(runner);

    const first = await R.run({
      cwd: repo,
      role: "fixer",
      allow: ["src/a.txt"],
      brief: "Add a line.",
      model: "fake/model-2",
      harness: "opencode",
    });
    expect(first.status).toBe("ok");
    const second = await R.followup(first.id, "FOLLOW-UP: add another line.");
    expect(second.status).toBe("ok");
    expect(second.worker.route).toBe("adhoc");
    await R.discard(first.id);
  });

  it("shouldTryAKindsModelsBeforeTheTiersOwn", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    config.models.other = { ...config.models.fake, family: "other" };
    config.kinds = { ui: { light: ["other"] } };
    fs.writeFileSync(configFile, JSON.stringify(config));

    try {
      const r = await R.run({ cwd: repo, role: "scout", brief: "Look.", kind: "ui", plan: true });
      expect(r.worker.modelId).toBe("other");
      expect(r.fallbacks).toEqual([{ modelId: "fake", route: "fake-route" }]);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldReviewAChangeMadeOutsideDispatchWithAnotherFamily", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    // The orchestrator's own models are fake's family; other runs on another pool.
    const route = { ...config.models.fake.routes[0], id: "other-route", quotaPool: "other-pool" };
    config.models.other = { family: "other", context: 0, routes: [route] };
    config.tiers.light = ["fake", "other"];
    config.orchestrators = { test: { pools: ["fake-pool"] } };
    fs.writeFileSync(configFile, JSON.stringify(config));
    const diff =
      "diff --git a/src/a.txt b/src/a.txt\n--- a/src/a.txt\n+++ b/src/a.txt\n@@ -1 +1,2 @@\n start\n+native\n";
    const review = { cwd: repo, role: "reviewer", brief: "Review. SHORT", reviewDiff: diff, orchestrator: "test" };

    try {
      const r = await R.run({ ...review, tier: "light" });
      expect(r.status).toBe("ok");
      expect(r.worker.modelId).toBe("other");
      expect(r.worker.skipped).toContainEqual(
        expect.objectContaining({ reason: "same family as reviewed work (fake)" }),
      );
      await expect(R.run({ ...review, role: "scout" })).rejects.toThrow("--review-diff requires --role reviewer");
      // A rebrief of the review reviews the same diff, by the same rule.
      const again = await R.run({
        cwd: repo,
        rebriefOf: r.id,
        brief: "Again.",
        orchestrator: "test",
        tier: "light",
        plan: true,
      });
      expect(again.worker.modelId).toBe("other");
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldRefuseBadInvocationsAsUsageErrors", () => {
    const dispatch = path.resolve(runner, "../../dispatch.mjs");
    const cli = (args: string[], cwd = repo) =>
      spawnSync(process.execPath, [dispatch, ...args], { cwd, input: "Look.", encoding: "utf8", env: process.env });
    const batchFile = path.join(tmp, "string-allow.json");
    fs.writeFileSync(batchFile, JSON.stringify([{ role: "fixer", allow: "src/a.txt", brief: "Edit." }]));

    const noId = cli(["apply"]);
    expect([noId.status, noId.stderr]).toEqual([1, "dispatch: apply needs a run id\n"]);
    const stringAllow = cli(["run", "--batch", batchFile, "--plan"]);
    expect([stringAllow.status, stringAllow.stderr]).toEqual([
      1,
      "dispatch: task 0: allow must be an array of globs\n",
    ]);
    const outside = cli(["run", "--role", "scout", "--brief", "-"], tmp);
    expect(outside.status).toBe(1);
    expect(outside.stderr).toContain("not in a git repository");
    fs.writeFileSync(batchFile, JSON.stringify([{ role: "scout", brief: 7 }]));
    const numberBrief = cli(["run", "--batch", batchFile, "--plan"]);
    expect([numberBrief.status, numberBrief.stderr]).toEqual([1, "dispatch: task 0: brief must be text\n"]);
    expect(cli(["run", "--role", "scout", "--efort", "high", "--brief", "-"]).stderr).toBe(
      "dispatch: unknown option --efort; run with --help\n",
    );
    fs.writeFileSync(batchFile, JSON.stringify([{ role: "scout", brief: "a", briefFile: "b" }]));
    expect(cli(["run", "--batch", batchFile, "--plan"]).stderr).toBe(
      "dispatch: task 0: give brief or briefFile, not both\n",
    );
    fs.writeFileSync(batchFile, JSON.stringify([{ role: "scout", briefFile: 7 }]));
    expect(cli(["run", "--batch", batchFile, "--plan"]).stderr).toBe("dispatch: task 0: briefFile must be a path\n");
    fs.writeFileSync(batchFile, JSON.stringify([{ role: "scout", briefFile: path.join(tmp, "missing.txt") }]));
    expect(cli(["run", "--batch", batchFile, "--plan"]).stderr).toContain("task 0: file not found");
    expect(cli(["run", "--batch", tmp, "--plan"]).stderr).toContain("batch file not found");
    for (const args of [
      ["run", "--role", "scout", "--brief", tmp],
      ["run", "--role", "reviewer", "--brief", "-", "--review-diff", ""],
      ["run", "--role", "scout", "--tier", "huge", "--brief", "-"],
    ]) {
      expect(cli(args).status).toBe(1);
    }
  });

  it("shouldRefuseAReviewWithoutABrief", async () => {
    const R = await import(runner);
    const diff = "+++ b/src/a.txt\n+x\n";

    await expect(R.run({ cwd: repo, role: "reviewer", reviewDiff: diff, model: "fake" })).rejects.toThrow(
      "empty brief",
    );
  });

  it("shouldNotRunAConfigModelIdAsAHarnessModelId", async () => {
    const R = await import(runner);

    const r = await R.run({ cwd: repo, role: "scout", brief: "Look.", model: "fake", harness: "codex", plan: true });
    expect(r.status).toBe("not_available");
    expect(r.worker.skipped).toEqual([{ modelId: "fake", reason: "no codex route" }]);
  });

  it("shouldGiveAnIdThatIsAllVersionNoModelLine", async () => {
    const { adhocRoute } = await import(path.resolve(runner, "../route.mjs"));
    const cfg = {
      models: {
        old: { family: "acme", routes: [{ id: "r", harness: "agy", model: "2.0-flash", quotaPool: "p" }] },
      },
    };

    expect(adhocRoute(cfg, "agy", "4o")).toMatchObject({ family: "unknown", route: { quotaPool: "p" } });
  });

  it("shouldNotRepeatTheVerdictAtTheTopOfTheReport", async () => {
    const R = await import(runner);

    const r = await R.run({ cwd: repo, role: "reviewer", brief: "Review. SHORT ECHO VERDICT reject", model: "fake" });
    expect(r.report).toBe("verdict: reject\none finding");
  });

  it("shouldKeepAnExternalRunExternalOnItsRebrief", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    fs.writeFileSync(
      configFile,
      JSON.stringify({ ...JSON.parse(original), orchestrators: { test: { pools: ["fake-pool"] } } }),
    );
    const fixer = { cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", orchestrator: "test" };

    try {
      const first = await R.run({ ...fixer, external: true });
      expect(first.status).toBe("ok");
      // The light tier's only model is the orchestrator's own: native, but for the carried-over --external.
      const rebrief = { cwd: repo, rebriefOf: first.id, brief: "Better.", orchestrator: "test", tier: "light" };
      const again = await R.run({ ...rebrief, plan: true });
      expect(again.status).toBe("planned");
      await R.discard(first.id);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldDropTheWorktreeOfAnEditingRunNoWorkerCouldRun", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    config.models.broken = {
      family: "fake",
      context: 0,
      routes: [{ id: "broken-route", harness: "opencode", model: "fake/broken", quotaPool: "broken-pool" }],
    };
    fs.writeFileSync(configFile, JSON.stringify(config));

    try {
      const r = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt"],
        brief: "Add a line.",
        model: "broken",
        isolation: "worktree",
      });
      expect(r.status).toBe("harness_error");
      expect(r.worktree).toBeNull();
      expect(fs.existsSync(path.join(process.env.DELEGATE_WORK_STATE as string, "runs", r.id, "wt"))).toBe(false);
    } finally {
      fs.writeFileSync(configFile, original);
      fs.rmSync(path.join(process.env.DELEGATE_WORK_STATE as string, "cooldowns.json"), { force: true });
    }
  });

  it("shouldRefuseToReviewARunThatChangedNothing", async () => {
    const R = await import(runner);

    const scout = await R.run({ cwd: repo, role: "scout", brief: "Look. SHORT", model: "fake" });
    await expect(R.run({ cwd: repo, role: "reviewer", review: scout.id, brief: "Review." })).rejects.toThrow(
      "has no change to review",
    );
  });

  it("shouldReviewTheSameChangeOnARebriefOfAReview", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    config.models.other = { ...config.models.fake, family: "other" };
    config.tiers.light = ["fake", "other"];
    fs.writeFileSync(configFile, JSON.stringify(config));

    try {
      const fixed = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt"],
        brief: "Add a line.",
        model: "fake",
      });
      const review = await R.run({ cwd: repo, role: "reviewer", review: fixed.id, tier: "light", brief: "SHORT" });
      const again = await R.run({ cwd: repo, rebriefOf: review.id, brief: "SHORT again", tier: "light", plan: true });
      expect(again.lineage.reviewOf).toBe(fixed.id);
      expect(again.worker.modelId).toBe("other");
      await R.discard(fixed.id);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldKeepTheRetryWhenRebriefingARunThatNeverRan", async () => {
    const R = await import(runner);
    const fixer = { cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line." };

    // Nothing is configured for the strong tier.
    const none = await R.run({ ...fixer, tier: "strong" });
    expect(none.status).toBe("not_available");
    // Same tier, not the role's default nor one up.
    const planned = await R.run({ cwd: repo, rebriefOf: none.id, brief: "Add a line.", plan: true });
    expect(planned.worker.tier).toBe("strong");
    const first = await R.run({ cwd: repo, rebriefOf: none.id, brief: "Add a line.", model: "fake" });
    expect(first.status).toBe("ok");
    expect(first.retryAvailable).toBe(true);
    expect(first.lineage.rebriefOf).toBe(none.id);
    await R.discard(first.id);
    const noneAgain = await R.run({ cwd: repo, rebriefOf: first.id, brief: "Better.", tier: "strong" });
    await expect(R.run({ cwd: repo, rebriefOf: noneAgain.id, brief: "Better." })).rejects.toThrow(
      `run ${noneAgain.id} never ran; rebrief ${first.id} instead`,
    );
  });

  it("shouldRunTheConfigModelNamedOverOneWhoseRouteHasThatId", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    // "alias" comes first and runs a harness model whose id is another config model's name.
    const route = config.models.fake.routes[0];
    config.models = {
      alias: { family: "fake", context: 0, routes: [{ ...route, id: "alias-route", model: "other" }] },
      ...config.models,
      other: { family: "other", context: 0, routes: [{ ...route, id: "other-route" }] },
    };
    fs.writeFileSync(configFile, JSON.stringify(config));

    try {
      const r = await R.run({ cwd: repo, role: "scout", brief: "Look.", model: "other", plan: true });
      expect(r.worker).toMatchObject({ modelId: "other", route: "other-route" });
      expect(r.fallbacks).toEqual([]);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldGiveAProviderIdThatIsAllVersionNoModelLine", async () => {
    const { adhocRoute } = await import(path.resolve(runner, "../route.mjs"));
    const route = { id: "r", harness: "opencode", model: "openrouter/2.0-flash", quotaPool: "or" };
    const cfg = { models: { flash: { family: "google", routes: [route] } } };

    // Same provider: its pool, but not its family.
    expect(adhocRoute(cfg, "opencode", "openrouter/4o")).toMatchObject({
      family: "unknown",
      route: { quotaPool: "or" },
    });
  });

  it("shouldKeepAWorktreeAReviewIsReading", async () => {
    const R = await import(runner);
    const S = await import(state);

    const fixed = await R.run({
      cwd: repo,
      role: "fixer",
      allow: ["src/a.txt"],
      brief: "Add a line.",
      model: "fake",
      isolation: "worktree",
    });
    const reviewer = S.newRun();
    const reading = { id: reviewer, reviewOf: fixed.id, sharedWorkDir: true, phase: "running", pid: process.pid };
    S.saveMeta(reviewer, reading);
    try {
      for (const r of [await R.discard(fixed.id), R.apply(fixed.id)]) {
        expect(r.status).toBe("conflict");
        expect(r.hint).toContain(`Review ${reviewer} is still reading`);
      }
    } finally {
      S.saveMeta(reviewer, { ...reading, phase: "done" });
    }
    expect((await R.discard(fixed.id)).worktree).toBeNull();
  });

  it("shouldRefuseEditingRunsWhileAnotherWorksInPlace", async () => {
    const R = await import(runner);
    const S = await import(state);
    const fixer = { cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" };

    const first = await R.run(fixer);
    const { root } = S.loadMeta(first.id);
    await R.discard(first.id);
    const holder = S.newRun();
    const held = { id: holder, root, editing: true, isolation: "inplace", phase: "running", pid: process.pid };
    S.saveMeta(holder, { ...held, claimedAt: 0 });
    try {
      for (const isolation of ["auto", "worktree"]) {
        // oxlint-disable-next-line no-await-in-loop -- each refusal must leave no run claiming the tree for the next.
        await expect(R.run({ ...fixer, isolation })).rejects.toThrow("would build on its unfinished changes");
      }
      await expect(R.batch([fixer, { ...fixer, allow: ["src/b.txt"] }], { cwd: repo })).rejects.toThrow(
        `In-place run ${holder} is still working`,
      );
      // Reading goes ahead.
      expect((await R.run({ cwd: repo, role: "scout", brief: "Look. SHORT", model: "fake" })).status).toBe("ok");
    } finally {
      S.saveMeta(holder, { ...held, phase: "done" });
    }
  });

  it("shouldRestoreAFileTheWorkerTurnedIntoAFolder", async () => {
    const R = await import(runner);
    const S = await import(state);
    const file = path.join(repo, "src", "a.txt");
    const before = fs.readFileSync(file, "utf8");

    const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/**"], brief: "Add a line.", model: "fake" });
    // Cut short, after the worker made the file a folder.
    S.saveMeta(r.id, { ...S.loadMeta(r.id), phase: "interrupted" });
    fs.rmSync(file);
    fs.mkdirSync(file);
    fs.writeFileSync(path.join(file, "inner.txt"), "x\n");
    await R.discard(r.id);
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });

  it("shouldPutBackWhatAnApplyWroteWhenItFailsHalfway", async () => {
    const R = await import(runner);
    const a = path.join(repo, "src", "a.txt");
    const locked = path.join(repo, "src", "locked.txt");
    fs.writeFileSync(locked, "mine\n");
    const before = fs.readFileSync(a, "utf8");

    const r = await R.run({
      cwd: repo,
      role: "fixer",
      allow: ["src/a.txt", "src/locked.txt"],
      brief: "Add a line. ALSO-WRITE src/locked.txt",
      model: "fake",
      isolation: "worktree",
    });
    expect(r.status).toBe("ok");
    // Read-only (on Windows, the attribute): src/a.txt is written first, then this one fails.
    fs.chmodSync(locked, 0o444);
    try {
      const applied = R.apply(r.id);
      expect(applied.status).toBe("conflict");
      expect(applied.hint).toContain("back as they were");
      expect(fs.readFileSync(a, "utf8")).toBe(before);
      expect(fs.existsSync(r.worktree)).toBe(true);
    } finally {
      fs.chmodSync(locked, 0o644);
      await R.discard(r.id);
      fs.rmSync(locked, { force: true });
    }
  });

  it("shouldRestoreAFileTheChecksTurnedIntoAFolder", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    const fold = path.join(tmp, "fold.js");
    fs.writeFileSync(
      fold,
      'const fs = require("fs"); fs.rmSync("src/folded.txt"); fs.mkdirSync("src/folded.txt"); fs.writeFileSync("src/folded.txt/in.txt", "x");',
    );
    config.projects = { [`${repo.replaceAll("\\", "/")}/**`]: { checks: { fast: [`node "${fold}"`] } } };
    fs.writeFileSync(configFile, JSON.stringify(config));
    const folded = path.join(repo, "src", "folded.txt");
    fs.writeFileSync(folded, "kept\n");

    try {
      const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
      expect(r.status).toBe("out_of_scope");
      expect(fs.readFileSync(folded, "utf8")).toBe("kept\n");
      await R.discard(r.id);
    } finally {
      fs.writeFileSync(configFile, original);
      fs.rmSync(folded, { recursive: true, force: true });
    }
  });

  it("shouldCallAFileTurnedIntoAFolderAConflict", async () => {
    const R = await import(runner);
    const a = path.join(repo, "src", "a.txt");

    const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
    const after = fs.readFileSync(a, "utf8");
    fs.rmSync(a);
    fs.mkdirSync(a);
    try {
      const d = await R.discard(r.id);
      expect(d.status).toBe("conflict");
      expect(d.hint).toContain("src/a.txt");
    } finally {
      fs.rmdirSync(a);
      fs.writeFileSync(a, after);
    }
    await R.discard(r.id);
  });

  it("shouldPutBackAFileTheUserRevertedAsTheyLeftIt", async () => {
    const R = await import(runner);
    const a = path.join(repo, "src", "a.txt");
    const locked = path.join(repo, "src", "locked3.txt");
    fs.writeFileSync(locked, "mine\n");
    const before = fs.readFileSync(a, "utf8");

    const r = await R.run({
      cwd: repo,
      role: "fixer",
      allow: ["src/a.txt", "src/locked3.txt"],
      brief: "Add a line. ALSO-WRITE src/locked3.txt",
      model: "fake",
    });
    expect(r.status).toBe("ok");
    // Reverted by hand: already where the discard takes it.
    fs.writeFileSync(a, before);
    fs.chmodSync(locked, 0o444);
    try {
      const stopped = await R.discard(r.id);
      expect(stopped.status).toBe("conflict");
      expect(fs.readFileSync(a, "utf8")).toBe(before);
    } finally {
      fs.chmodSync(locked, 0o644);
    }
    await R.discard(r.id);
    fs.rmSync(locked, { force: true });
  });

  it("shouldKeepACopyAndPutBackWhenADiscardFailsHalfway", async () => {
    const R = await import(runner);
    const a = path.join(repo, "src", "a.txt");
    const locked = path.join(repo, "src", "locked2.txt");
    fs.writeFileSync(locked, "mine\n");
    const before = fs.readFileSync(a, "utf8");

    const r = await R.run({
      cwd: repo,
      role: "fixer",
      allow: ["src/a.txt", "src/locked2.txt"],
      brief: "Add a line. ALSO-WRITE src/locked2.txt",
      model: "fake",
    });
    expect(r.status).toBe("ok");
    const after = fs.readFileSync(a, "utf8");
    fs.chmodSync(locked, 0o444);
    try {
      const stopped = await R.discard(r.id);
      expect(stopped.status).toBe("conflict");
      expect(stopped.hint).toContain("back as they were");
      expect(fs.readFileSync(a, "utf8")).toBe(after);
    } finally {
      fs.chmodSync(locked, 0o644);
    }
    const done = await R.discard(r.id);
    expect(fs.readFileSync(a, "utf8")).toBe(before);
    const copy = done.hint.match(/are in (\S+?)\.$/)[1];
    expect(fs.readFileSync(path.join(copy, "src", "a.txt"), "utf8")).toBe(after);
    fs.rmSync(locked, { force: true });
  });

  it("shouldRefuseEditingRunsWhileARunCutShortHoldsTheTree", async () => {
    const R = await import(runner);
    const S = await import(state);
    const fixer = { cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" };

    const first = await R.run(fixer);
    const { root } = S.loadMeta(first.id);
    await R.discard(first.id);
    const done = await R.run({ ...fixer, isolation: "worktree" });
    expect(done.status).toBe("ok");
    const cut = S.newRun();
    const meta = { id: cut, root, editing: true, isolation: "inplace", phase: "interrupted", pid: 0 };
    S.saveMeta(cut, meta);
    try {
      await expect(R.run(fixer)).rejects.toThrow(`In-place run ${cut} was cut short`);
      // Its discard would take back what an apply wrote into its files.
      const applied = R.apply(done.id);
      expect(applied.status).toBe("conflict");
      expect(applied.hint).toContain("was cut short");
      // Refused before the attempt it retries is dropped.
      await expect(R.run({ cwd: repo, rebriefOf: done.id, brief: "Again." })).rejects.toThrow("was cut short");
      expect(S.loadMeta(done.id).discarded).toBeFalsy();
    } finally {
      S.saveMeta(cut, { ...meta, discarded: true });
      await R.discard(done.id);
    }
  });

  it("shouldKeepTheKindOnARebrief", async () => {
    const R = await import(runner);

    const first = await R.run({ cwd: repo, role: "scout", brief: "Look. SHORT", model: "fake", kind: "ui" });
    const again = await R.run({ cwd: repo, rebriefOf: first.id, brief: "Again.", model: "fake", plan: true });
    expect(again.worker.kind).toBe("ui");
  });

  it("shouldReviewOnlyAChangeThatIsInSomeTree", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    config.models.other = { ...config.models.fake, family: "other" };
    config.tiers.light = ["fake", "other"];
    fs.writeFileSync(configFile, JSON.stringify(config));
    const fixer = { cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" };
    const review = (id: string) => R.run({ cwd: repo, role: "reviewer", review: id, tier: "light", brief: "SHORT" });

    try {
      const dropped = await R.run(fixer);
      await R.discard(dropped.id);
      await expect(review(dropped.id)).rejects.toThrow("was discarded");
      // Applied, the change is in the working tree: read there, in place.
      const applied = await R.run({ ...fixer, isolation: "worktree" });
      R.apply(applied.id);
      expect((await review(applied.id)).isolation).toBe("inplace");
      R.unapply(applied.id);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  }, 20000);

  it("shouldTellANativeReviewerTheDiffWasCut", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    const route = { ...config.models.fake.routes[0], id: "other-route", quotaPool: "other-pool" };
    config.models.other = { family: "other", context: 0, routes: [route] };
    config.tiers.light = ["fake", "other"];
    config.orchestrators = { test: { pools: ["other-pool"] } };
    fs.writeFileSync(configFile, JSON.stringify(config));

    try {
      const big = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt", "src/big.txt"],
        brief: "Add a line. BIG-DIFF",
        model: "fake",
      });
      const r = await R.run({
        cwd: repo,
        role: "reviewer",
        review: big.id,
        tier: "light",
        brief: "R",
        orchestrator: "test",
      });
      expect(r.status).toBe("use_native");
      expect(r.hint).toContain("diff cut at 60000 characters");
      await R.discard(big.id);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldCountTheChecksInTheDuration", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    const wait = path.join(tmp, "wait.js");
    fs.writeFileSync(wait, "setTimeout(() => {}, 1500);");
    config.projects = { [`${repo.replaceAll("\\", "/")}/**`]: { checks: { fast: [`node "${wait}"`] } } };
    fs.writeFileSync(configFile, JSON.stringify(config));

    try {
      const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
      expect(r.status).toBe("ok");
      expect(r.durationMs).toBeGreaterThanOrEqual(1500);
      await R.discard(r.id);
    } finally {
      fs.writeFileSync(configFile, original);
    }
  });

  it("shouldSkipANativePoolThatIsCoolingDown", async () => {
    const R = await import(runner);
    const S = await import(state);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    const route = { ...config.models.fake.routes[0], id: "other-route", quotaPool: "other-pool" };
    config.models.other = { family: "other", context: 0, routes: [route] };
    config.tiers.light = ["fake", "other"];
    config.orchestrators = { test: { pools: ["fake-pool"] } };
    fs.writeFileSync(configFile, JSON.stringify(config));
    S.setCooldown("fake-pool", 60000, "rate limit");

    try {
      const r = await R.run({ cwd: repo, role: "scout", brief: "Look.", orchestrator: "test", plan: true });
      expect(r.status).toBe("planned");
      expect(r.worker.modelId).toBe("other");
      expect(r.worker.skipped).toContainEqual(
        expect.objectContaining({ modelId: "fake", reason: expect.stringContaining("cooling down") }),
      );
    } finally {
      fs.writeFileSync(configFile, original);
      fs.rmSync(path.join(process.env.DELEGATE_WORK_STATE as string, "cooldowns.json"), { force: true });
    }
  });

  it("shouldBlockAnUnlistedModelWhoseProviderHasNoDataPolicy", async () => {
    const R = await import(runner);

    // Claude Code lists no models, so nothing else rules the id out first.
    const r = await R.run({ cwd: repo, role: "scout", brief: "Look.", harness: "claude", model: "x", plan: true });
    expect(r.status).toBe("not_available");
    expect(r.hint).toContain("data policy: unknown for this provider");
  });

  it("shouldSayWhenNoOrchestratorFamilyWasExcluded", async () => {
    const R = await import(runner);
    const diff = "diff --git a/src/a.txt b/src/a.txt\n--- a/src/a.txt\n+++ b/src/a.txt\n@@ -1 +1,2 @@\n start\n+x\n";

    const r = await R.run({
      cwd: repo,
      role: "reviewer",
      reviewDiff: diff,
      brief: "R",
      model: "fake",
      orchestrator: "none",
      plan: true,
    });
    expect(r.status).toBe("planned");
    expect(r.hint).toContain("No orchestrator was recognized");
  });

  it("shouldDropTheOldEffortWhenARebriefNamesAModel", async () => {
    const R = await import(runner);
    const fixer = { cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line." };

    const first = await R.run({ ...fixer, model: "fake", effort: "high" });
    expect(first.worker.effort).toBe("high");
    const kept = await R.run({ cwd: repo, rebriefOf: first.id, brief: "Again.", plan: true });
    expect(kept.worker.effort).toBe("high");
    const dropped = await R.run({ cwd: repo, rebriefOf: first.id, brief: "Again.", model: "fake", plan: true });
    expect(dropped.worker.effort).toBeNull();
    await R.discard(first.id);
  });

  it("shouldRefuseAFolderInTheAllowlist", async () => {
    const R = await import(runner);
    const fixer = { cwd: repo, role: "fixer", brief: "Add a line.", model: "fake", plan: true };

    await expect(R.run({ ...fixer, allow: ["src"] })).rejects.toThrow(
      "--allow src names a folder; to allow the files in it, use src/**",
    );
    await expect(R.run({ ...fixer, allow: ["new/"] })).rejects.toThrow("use new/**");
    expect((await R.run({ ...fixer, allow: ["src/**"] })).status).toBe("planned");
  });

  it("shouldLeaveTheResultWhenAFollowUpsHarnessIsGone", async () => {
    const R = await import(runner);
    const S = await import(state);
    const first = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
    const briefFile = path.join(tmp, "followup.txt");
    fs.writeFileSync(briefFile, "FOLLOW-UP: more.");

    // A fresh dispatch: the harness check is cached per process.
    const dispatch = path.resolve(runner, "../../dispatch.mjs");
    const r = spawnSync(process.execPath, [dispatch, "followup", first.id, "--brief", briefFile], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, DELEGATE_WORK_BIN_OPENCODE: path.join(tmp, "missing-opencode") },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("the result stands and the retry is unused");
    expect(S.loadMeta(first.id)).toMatchObject({ status: "ok", retryUsed: false });
    await R.discard(first.id);
  });

  it("shouldKeepTheDiffOfAReviewThatNeverRan", async () => {
    const R = await import(runner);
    const S = await import(state);
    const diff = "diff --git a/src/a.txt b/src/a.txt\n--- a/src/a.txt\n+++ b/src/a.txt\n@@ -1 +1,2 @@\n start\n+x\n";

    const r = await R.run({
      cwd: repo,
      role: "reviewer",
      reviewDiff: diff,
      brief: "R",
      harness: "opencode",
      model: "fake/absent",
    });
    expect(r.status).toBe("not_available");
    expect(fs.readFileSync(path.join(S.runDir(r.id), "review.diff"), "utf8")).toBe(diff);
  });

  it("shouldFenceADiffThatHoldsAFence", async () => {
    const R = await import(runner);
    const configFile = process.env.DELEGATE_WORK_CONFIG as string;
    const original = fs.readFileSync(configFile, "utf8");
    const config = JSON.parse(original);
    const route = { ...config.models.fake.routes[0], id: "other-route", quotaPool: "other-pool" };
    config.models.other = { family: "other", context: 0, routes: [route] };
    config.tiers.light = ["fake", "other"];
    config.orchestrators = { test: { pools: ["other-pool"] } };
    fs.writeFileSync(configFile, JSON.stringify(config));
    const a = path.join(repo, "src", "a.txt");
    const before = fs.readFileSync(a, "utf8");
    // In the diff's context: a Markdown fence in the changed file.
    fs.writeFileSync(a, `${before}\`\`\`js\n\`\`\`\n`);

    try {
      const fixed = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt"],
        brief: "Add a line.",
        model: "fake",
      });
      const r = await R.run({
        cwd: repo,
        role: "reviewer",
        review: fixed.id,
        tier: "light",
        brief: "R",
        orchestrator: "test",
      });
      expect(r.status).toBe("use_native");
      const prompt = fs.readFileSync(r.promptPath, "utf8");
      expect(prompt).toContain("````diff\n");
      expect(prompt).toMatch(/\n````$|\n````\n/);
      await R.discard(fixed.id);
    } finally {
      fs.writeFileSync(configFile, original);
      fs.writeFileSync(a, before);
    }
  });

  it("shouldNotTakeTheTemplateVerdictLineForAVerdict", async () => {
    const R = await import(runner);

    const r = await R.run({ cwd: repo, role: "reviewer", brief: "Review. SHORT TEMPLATE-VERDICT", model: "fake" });
    expect(r.status).toBe("ok");
    expect(r.report).not.toMatch(/^verdict:/);
    expect(r.hint).toContain("no valid verdict");
  });

  describe("with a harness that can't be contained in place", () => {
    let opencode: { containedInPlace?: boolean };

    beforeAll(async () => {
      ({ default: opencode } = await import(adapter("opencode")));
      opencode.containedInPlace = false;
    });

    afterAll(() => {
      delete opencode.containedInPlace;
    });

    it("shouldGiveALoneEditingRunAWorktree", async () => {
      const R = await import(runner);

      const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
      expect(r.status).toBe("ok");
      expect(r.isolation).toBe("worktree");
      expect(r.applied).toBe(false);
      expect(fs.readFileSync(path.join(r.worktree, "src", "a.txt"), "utf8")).toMatch(/first\n$/);
      expect((await R.discard(r.id)).worktree).toBeNull();
    });

    it("shouldPointPwdAtTheWorktreeForTheWorkerAndTheChecks", async () => {
      const R = await import(runner);
      const configFile = process.env.DELEGATE_WORK_CONFIG as string;
      const original = fs.readFileSync(configFile, "utf8");
      const config = JSON.parse(original);
      config.projects = {
        [`${repo.replaceAll("\\", "/")}/**`]: {
          checks: {
            fast: [
              "node -e \"const r=require('fs').realpathSync.native;process.exit(r(process.env.PWD)===r(process.cwd())?0:1)\"",
            ],
          },
        },
      };
      fs.writeFileSync(configFile, JSON.stringify(config));
      // What a shell started in the repository passes down.
      process.env.PWD = repo;

      try {
        const r = await R.run({ cwd: repo, role: "fixer", allow: ["src/a.txt"], brief: "Add a line.", model: "fake" });
        expect(r.isolation).toBe("worktree");
        expect(r.summary).toContain("PWD=cwd");
        expect(r.checks).toEqual([{ name: "check1", ok: true, tail: "" }]);
        await R.discard(r.id);
      } finally {
        fs.writeFileSync(configFile, original);
        if (saved.PWD === undefined) {
          delete process.env.PWD;
        } else {
          process.env.PWD = saved.PWD;
        }
      }
    });

    it("shouldRestoreAWorktreeGitFileTheWorkerRepointed", async () => {
      const R = await import(runner);

      const r = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt"],
        brief: "Add a line. REPOINT-GIT",
        model: "fake",
      });
      expect(r.status).toBe("out_of_scope");
      expect(r.files.outOfScope).toContain("(worktree .git file changed: restored)");
      expect(r.files.changed.map((c: { path: string }) => c.path)).toEqual(["src/a.txt"]);
      await R.discard(r.id);
    });

    it("shouldNotTrustChecksAfterTheWorkerReplacedADependencyLink", async () => {
      const R = await import(runner);
      fs.mkdirSync(path.join(repo, "node_modules"), { recursive: true });
      fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");

      try {
        const r = await R.run({
          cwd: repo,
          role: "fixer",
          allow: ["src/a.txt"],
          brief: "Add a line. SWAP-LINK",
          model: "fake",
        });
        expect(r.status).toBe("out_of_scope");
        expect(r.files.outOfScope).toContain("(dependency link node_modules replaced)");
        await R.discard(r.id);
        // The worker's folder went with the worktree; the real one stays.
        expect(fs.existsSync(path.join(repo, "node_modules"))).toBe(true);
      } finally {
        fs.rmSync(path.join(repo, "node_modules"), { recursive: true });
        fs.rmSync(path.join(repo, ".gitignore"));
      }
    });

    it.skipIf(process.platform === "win32")("shouldNotApplyASymbolicLinkTheWorkerMade", async () => {
      const R = await import(runner);

      const r = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt", "src/l.txt"],
        brief: "Add a line. MAKE-FILE-LINK /etc/passwd",
        model: "fake",
      });
      expect(r.status).toBe("ok");
      const applied = R.apply(r.id);
      expect(applied.status).toBe("conflict");
      expect(applied.hint).toContain("symbolic links, which apply doesn't write: src/l.txt");
      expect(fs.existsSync(path.join(repo, "src", "l.txt"))).toBe(false);
      await R.discard(r.id);
    });

    it("shouldSkipItWhenInPlaceIsRequested", async () => {
      const R = await import(runner);

      const r = await R.run({
        cwd: repo,
        role: "fixer",
        allow: ["src/a.txt"],
        brief: "Add a line.",
        model: "fake",
        isolation: "inplace",
      });
      expect(r.status).toBe("not_available");
      expect(r.worker.skipped).toContainEqual(expect.objectContaining({ reason: "opencode: can't edit in place" }));
    });
  });
});
