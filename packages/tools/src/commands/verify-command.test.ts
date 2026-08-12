import { describe, expect, it, vi } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";
import { createVerifyCommand } from "./verify-command.ts";

interface RunResult {
  exitCode: number;
  output: string;
  ran: string[];
  /** Whether each step was told a build had already run for it. */
  builtBySelf: Record<string, boolean>;
}

/**
 * Runs a verification with every step stubbed.
 * @param failingStep Step that exits non-zero, or `undefined` for an all-passing run.
 * @param argv Extra arguments passed to the command line.
 * @returns Exit code, captured output, and the step names that actually ran.
 */
async function runVerify(failingStep?: string, argv: readonly string[] = []): Promise<RunResult> {
  const lines: string[] = [];
  const ran: string[] = [];
  const builtBySelf: Record<string, boolean> = {};
  const resolver = vi.fn(
    (name: string): CommandDefinition => ({
      name,
      run: async (stepContext) => {
        ran.push(name);
        builtBySelf[name] = stepContext.options.shouldBuild;
        expect(stepContext.passthrough).toEqual([]);
        return name === failingStep ? EXIT_FAILURE : EXIT_SUCCESS;
      },
      summary: name,
      usage: name,
    }),
  );
  const context: CommandContext = {
    options: parseArguments(["verify", ...argv]).options,
    passthrough: ["--reporter=verbose"],
    reporter: createReporter({
      useColor: false,
      write: (line) => lines.push(line),
      writeError: (line) => lines.push(line),
    }),
    selection: { isImplicit: true, targets: [], unownedPaths: [] },
    tokens: [],
    workspace: { packages: [], root: "/repo" },
  };

  const exitCode = await createVerifyCommand(resolver).run(context);

  return { builtBySelf, exitCode, output: lines.join("\n"), ran };
}

describe("hub verify", () => {
  it("runs every step in order and succeeds", async () => {
    const result = await runVerify();

    expect(result.ran).toEqual(["format", "lint", "build", "typecheck", "test", "test:browser", "check"]);
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("stops at the first failing step", async () => {
    const result = await runVerify("typecheck");

    expect(result.ran).toEqual(["format", "lint", "build", "typecheck"]);
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("leaves out a step named by --skip and still reports it", async () => {
    const result = await runVerify(undefined, ["--skip=test:browser"]);

    expect(result.ran).toEqual(["format", "lint", "build", "typecheck", "test", "check"]);
    expect(result.output).toContain("SKIP  test:browser skipped by --skip");
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("warns when --skip names no step", async () => {
    const result = await runVerify(undefined, ["--skip=browsers"]);

    expect(result.output).toContain("`--skip=browsers` names no verification step");
    expect(result.ran).toHaveLength(7);
  });

  it("accounts for the steps it never reached", async () => {
    const result = await runVerify("lint");

    expect(result.output).toContain("FAIL  lint");
    expect(result.output).toContain("SKIP  test");
    expect(result.output).toContain("SKIP  test:browser");
    expect(result.output).toContain("SKIP  check");
  });

  it("builds once and leaves the later steps nothing to rebuild", async () => {
    const result = await runVerify();

    expect(result.builtBySelf.build).toBe(true);
    expect(result.builtBySelf.typecheck).toBe(false);
    expect(result.builtBySelf.test).toBe(false);
    expect(result.builtBySelf["test:browser"]).toBe(false);
  });

  it("keeps the build for the steps that run before it", async () => {
    const result = await runVerify();

    expect(result.builtBySelf.format).toBe(true);
    expect(result.builtBySelf.lint).toBe(true);
  });

  it("leaves the build step out entirely under --no-build", async () => {
    const result = await runVerify(undefined, ["--no-build"]);

    expect(result.ran).toEqual(["format", "lint", "typecheck", "test", "test:browser", "check"]);
    expect(result.output).toContain("SKIP  build");
    expect(result.output).toContain("skipped by --no-build");
  });

  it("leaves the build step out when --skip names it", async () => {
    const result = await runVerify(undefined, ["--skip=build"]);

    expect(result.ran).not.toContain("build");
    expect(result.builtBySelf.typecheck).toBe(true);
  });
});
