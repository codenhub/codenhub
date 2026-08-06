import { describe, expect, it } from "vitest";

import { execute, formatCommand, resolveInvocation } from "./execute.ts";

const isWindows = process.platform === "win32";

describe("formatCommand", () => {
  it("shouldRenderACopyableCommandLine", () => {
    expect(formatCommand({ args: ["run", "test"], command: "pnpm", cwd: "/repo" })).toBe("pnpm run test");
  });

  it("shouldQuoteArgumentsContainingSpaces", () => {
    expect(formatCommand({ args: ["a b"], command: "pnpm", cwd: "/repo" })).toBe('pnpm "a b"');
  });
});

describe("resolveInvocation", () => {
  it.runIf(isWindows)("shouldRouteThroughTheCommandInterpreterOnWindows", () => {
    const invocation = resolveInvocation({ args: ["run", "test"], command: "pnpm", cwd: "/repo" });

    expect(invocation.args).toEqual(["/d", "/s", "/c", '"pnpm run test"']);
    expect(invocation.useWindowsVerbatimArguments).toBe(true);
  });

  it.runIf(isWindows)("shouldQuoteWindowsArgumentsContainingSpaces", () => {
    const invocation = resolveInvocation({ args: ["a b"], command: "tool", cwd: "/repo" });

    expect(invocation.args[3]).toBe('"tool "a b""');
  });

  it.skipIf(isWindows)("shouldRunTheExecutableDirectlyElsewhere", () => {
    const invocation = resolveInvocation({ args: ["run", "test"], command: "pnpm", cwd: "/repo" });

    expect(invocation.file).toBe("pnpm");
    expect(invocation.args).toEqual(["run", "test"]);
    expect(invocation.useWindowsVerbatimArguments).toBe(false);
  });
});

describe("execute", () => {
  it("shouldReportSuccessAndCaptureOutput", async () => {
    const outcome = await execute(
      { args: ["-e", "console.log('hello')"], command: process.execPath, cwd: process.cwd() },
      { stdio: "pipe" },
    );

    expect(outcome.isSuccess).toBe(true);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.output).toContain("hello");
  });

  it("shouldReportFailureWithoutThrowing", async () => {
    const outcome = await execute(
      { args: ["-e", "process.exit(3)"], command: process.execPath, cwd: process.cwd() },
      { stdio: "pipe" },
    );

    expect(outcome.isSuccess).toBe(false);
    expect(outcome.exitCode).toBe(3);
  });

  it("shouldKillARunThatExceedsItsTimeout", async () => {
    const outcome = await execute(
      { args: ["-e", "setTimeout(() => {}, 30000)"], command: process.execPath, cwd: process.cwd() },
      { stdio: "pipe", timeoutMs: 200 },
    );

    expect(outcome.didTimeOut).toBe(true);
    expect(outcome.isSuccess).toBe(false);
  });

  // Windows routes commands through the interpreter, which reports a missing
  // executable as a normal non-zero exit rather than a spawn failure.
  it.skipIf(isWindows)("shouldRejectWhenTheExecutableCannotBeStarted", async () => {
    await expect(
      execute({ args: [], command: "codenhub-missing-executable", cwd: process.cwd() }, { stdio: "pipe" }),
    ).rejects.toThrow(/Failed to run/);
  });
});
