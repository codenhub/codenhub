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

    expect(invocation.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(invocation.args[3]).toContain("pnpm");
    expect(invocation.args[3]).not.toContain("run test");
    expect(invocation.useWindowsVerbatimArguments).toBe(true);
  });

  it.runIf(isWindows)("shouldQuoteWindowsArgumentsContainingSpaces", () => {
    const invocation = resolveInvocation({ args: ["a b"], command: "tool", cwd: "/repo" });

    expect(invocation.args[3]).not.toContain("a b");
    expect(invocation.args[3]).not.toContain("^");
    expect(Object.values(invocation.env ?? {})).toContain('^"a^ b^"');
  });

  it.runIf(isWindows)("shouldKeepPercentDelimitedArgumentsOutOfTheCommandString", () => {
    const invocation = resolveInvocation({ args: ["%TEMP%"], command: "tool", cwd: "/repo" });

    expect(invocation.args[3]).not.toContain("%TEMP%");
    expect(invocation.args[3]).not.toContain("^");
    expect(Object.values(invocation.env ?? {})).toContain('^"^%TEMP^%^"');
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

  it("shouldPreservePercentDelimitedArguments", async () => {
    const outcome = await execute(
      {
        args: ["-e", "process.stdout.write(process.argv[1])", "%TEMP%"],
        command: process.execPath,
        cwd: process.cwd(),
        env: { ...process.env, TEMP: "expanded" },
      },
      { stdio: "pipe" },
    );

    expect(outcome.stdout).toBe("%TEMP%");
  });

  it.runIf(isWindows)("shouldPreserveQuotesAndCommandOperatorsWithoutExecutingThemOnWindows", async () => {
    const argument = 'a" & echo injected & "';
    const outcome = await execute(
      {
        args: ["-e", "process.stdout.write(process.argv[1])", argument],
        command: process.execPath,
        cwd: process.cwd(),
      },
      { stdio: "pipe" },
    );

    expect(outcome.stdout).toBe(argument);
  });

  // Windows routes commands through the interpreter, which reports a missing
  // executable as a normal non-zero exit rather than a spawn failure.
  it.skipIf(isWindows)("shouldRejectWhenTheExecutableCannotBeStarted", async () => {
    await expect(
      execute({ args: [], command: "codenhub-missing-executable", cwd: process.cwd() }, { stdio: "pipe" }),
    ).rejects.toThrow(/Failed to run/);
  });
});

describe("shell invocations", () => {
  it("shouldHandTheWholeLineToTheInterpreter", () => {
    const invocation = resolveInvocation({ args: [], command: "tsc --noEmit", cwd: "/repo", shell: true });

    expect(invocation.args.some((argument) => argument.includes("tsc --noEmit"))).toBe(true);
  });

  it.runIf(isWindows)("shouldRouteAShellLineThroughTheInterpreterOnWindows", () => {
    const invocation = resolveInvocation({ args: [], command: "tsc --noEmit", cwd: "/repo", shell: true });

    expect(invocation.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(invocation.useWindowsVerbatimArguments).toBe(true);
  });

  it.skipIf(isWindows)("shouldRouteAShellLineThroughTheShellElsewhere", () => {
    const invocation = resolveInvocation({ args: [], command: "tsc --noEmit", cwd: "/repo", shell: true });

    expect(invocation.file).toBe("/bin/sh");
    expect(invocation.args[0]).toBe("-c");
  });

  it("shouldRenderAShellSpecAsItsOwnLine", () => {
    expect(formatCommand({ args: [], command: "a && b", cwd: "/repo", shell: true })).toBe("a && b");
  });

  it("shouldRenderArgumentsAfterAShellLine", () => {
    expect(formatCommand({ args: ["two words"], command: "tool", cwd: "/repo", shell: true })).toBe('tool "two words"');
  });

  it("shouldRunWithTheEnvironmentItWasGiven", async () => {
    const outcome = await execute(
      {
        args: ["-e", "process.stdout.write(process.env.CODENHUB_PROBE ?? '')"],
        command: process.execPath,
        cwd: process.cwd(),
        env: { ...process.env, CODENHUB_PROBE: "present" },
      },
      { stdio: "pipe" },
    );

    expect(outcome.output).toContain("present");
  });
});
