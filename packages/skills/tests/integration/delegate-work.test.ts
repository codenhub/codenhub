import { execFileSync } from "node:child_process";
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
const runner = path.resolve(here, "../../skills/delegate-work/scripts/lib/runner.mjs");
const state = path.resolve(here, "../../skills/delegate-work/scripts/lib/state.mjs");
const proc = path.resolve(here, "../../skills/delegate-work/scripts/lib/proc.mjs");
const adapter = (name: string) => path.resolve(here, `../../skills/delegate-work/adapters/${name}.mjs`);

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
      expect((await rebrief("strong")).status).toBe("not_available");
      const r = await rebrief("light");
      expect(r.status).toBe("use_native");
      expect(r.retryAvailable).toBe(false);
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
      await R.discard(r.id);
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
