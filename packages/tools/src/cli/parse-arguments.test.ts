import { describe, expect, it } from "vitest";

import { defaultConcurrency, parseArguments } from "./parse-arguments.ts";

describe("parseArguments", () => {
  it("shouldReadCommandAndTargets", () => {
    const parsed = parseArguments(["test", "error", "packages/kbd"]);

    expect(parsed.commandName).toBe("test");
    expect(parsed.tokens).toEqual(["error", "packages/kbd"]);
  });

  it("shouldDefaultToWholeWorkspaceSelection", () => {
    expect(parseArguments(["build"]).tokens).toEqual([]);
  });

  it("shouldForwardUnknownFlagsToTheUnderlyingTool", () => {
    const parsed = parseArguments(["test", "error", "--reporter=verbose", "-t"]);

    expect(parsed.passthrough).toEqual(["--reporter=verbose", "-t"]);
    expect(parsed.tokens).toEqual(["error"]);
  });

  it("shouldForwardEverythingAfterTheOptionTerminator", () => {
    const parsed = parseArguments(["test", "--", "--changed", "extra"]);

    expect(parsed.passthrough).toEqual(["--changed", "extra"]);
    expect(parsed.options.useChangedFilter).toBe(false);
  });

  it("shouldReadChangedFilterWithAnExplicitRef", () => {
    const parsed = parseArguments(["test", "--changed=develop"]);

    expect(parsed.options.useChangedFilter).toBe(true);
    expect(parsed.options.baseRef).toBe("develop");
  });

  it("shouldTreatBareChangedFlagAsMainComparison", () => {
    expect(parseArguments(["test", "--changed"]).options.baseRef).toBe("main");
  });

  it("shouldReadTimeoutInSeconds", () => {
    expect(parseArguments(["test", "--timeout=30"]).options.timeoutMs).toBe(30_000);
  });

  it("shouldSupportDisablingTheTimeout", () => {
    expect(parseArguments(["test", "--no-timeout"]).options.timeoutMs).toBeUndefined();
  });

  it("shouldDisablePrerequisiteBuilds", () => {
    expect(parseArguments(["test", "--no-build"]).options.shouldBuild).toBe(false);
  });

  it("shouldBuildWorkspaceDependenciesByDefault", () => {
    expect(parseArguments(["test"]).options.shouldBuildDependencies).toBe(true);
    expect(parseArguments(["test", "--no-deps"]).options.shouldBuildDependencies).toBe(false);
    expect(parseArguments(["test", "--no-deps", "--deps"]).options.shouldBuildDependencies).toBe(true);
  });

  it("shouldReadSkippedStepsAsAList", () => {
    const parsed = parseArguments(["verify", "--skip=test:browser, test"]);

    expect(parsed.options.skippedSteps).toEqual(["test:browser", "test"]);
  });

  it("shouldRejectASkipWithoutAStepName", () => {
    expect(() => parseArguments(["verify", "--skip"])).toThrow(/one or more step names/);
  });

  it("shouldRejectNonPositiveNumericOptions", () => {
    expect(() => parseArguments(["test", "--timeout=0"])).toThrow(/positive number/);
    expect(() => parseArguments(["test", "--parallel=abc"])).toThrow(/positive number/);
  });

  it("shouldReadShortHelpFlag", () => {
    expect(parseArguments(["test", "-h"]).options.wantsHelp).toBe(true);
  });

  it("shouldReadShortVersionFlags", () => {
    expect(parseArguments(["-v"]).options.wantsVersion).toBe(true);
    expect(parseArguments(["-V"]).options.wantsVersion).toBe(true);
  });

  it("shouldDefaultParallelToAvailableParallelism", () => {
    expect(parseArguments(["test", "--parallel"]).options.concurrency).toBeGreaterThan(0);
    expect(parseArguments(["test", "--parallel=16"]).options.concurrency).toBe(16);
  });

  it("shouldReadVersionFlagWithoutACommand", () => {
    expect(parseArguments(["--version"]).options.wantsVersion).toBe(true);
    expect(parseArguments(["--version"]).commandName).toBe("");
  });

  it("shouldReportAnEmptyCommandWhenNothingWasTyped", () => {
    expect(parseArguments([]).commandName).toBe("");
  });

  it("shouldRunSeveralPackagesAtOnceByDefault", () => {
    expect(parseArguments(["test"]).options.concurrency).toBe(defaultConcurrency());
    expect(parseArguments(["test"]).options.concurrency).toBeGreaterThan(1);
  });

  it("shouldReadAnExplicitParallelWidth", () => {
    expect(parseArguments(["test", "--parallel=3"]).options.concurrency).toBe(3);
  });

  it("shouldRejectAFractionalParallelWidth", () => {
    expect(() => parseArguments(["test", "--parallel=2.5"])).toThrow(/expected a whole number/);
  });

  it("shouldRejectATimeoutThatIsNotAFiniteNumber", () => {
    expect(() => parseArguments(["test", "--timeout=Infinity"])).toThrow(/expected a positive number/);
  });

  it("shouldReportOnlyFailuresUnlessVerboseIsRequested", () => {
    expect(parseArguments(["test"]).options.isVerbose).toBe(false);
    expect(parseArguments(["test", "--verbose"]).options.isVerbose).toBe(true);
  });
});
