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
});
