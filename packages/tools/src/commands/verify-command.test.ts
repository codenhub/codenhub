import { describe, expect, it, vi } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";
import { createVerifyCommand } from "./verify-command.ts";

interface RunResult {
  exitCode: number;
  output: string;
  ran: string[];
}

/**
 * Runs a verification with every step stubbed.
 * @param failingStep Step that exits non-zero, or `undefined` for an all-passing run.
 * @returns Exit code, captured output, and the step names that actually ran.
 */
async function runVerify(failingStep?: string): Promise<RunResult> {
  const lines: string[] = [];
  const ran: string[] = [];
  const resolver = vi.fn(
    (name: string): CommandDefinition => ({
      name,
      run: async (stepContext) => {
        ran.push(name);
        expect(stepContext.passthrough).toEqual([]);
        return name === failingStep ? EXIT_FAILURE : EXIT_SUCCESS;
      },
      summary: name,
      usage: name,
    }),
  );
  const context: CommandContext = {
    options: parseArguments(["verify"]).options,
    passthrough: ["--reporter=verbose"],
    reporter: createReporter({ useColor: false, write: (line) => lines.push(line), writeError: () => {} }),
    selection: { isImplicit: true, targets: [], unownedPaths: [] },
    tokens: [],
    workspace: { packages: [], root: "/repo" },
  };

  return { exitCode: await createVerifyCommand(resolver).run(context), output: lines.join("\n"), ran };
}

describe("hub verify", () => {
  it("runs every step in order and succeeds", async () => {
    const result = await runVerify();

    expect(result.ran).toEqual(["format", "lint", "typecheck", "test", "check"]);
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("stops at the first failing step", async () => {
    const result = await runVerify("typecheck");

    expect(result.ran).toEqual(["format", "lint", "typecheck"]);
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("accounts for the steps it never reached", async () => {
    const result = await runVerify("lint");

    expect(result.output).toContain("FAIL  lint");
    expect(result.output).toContain("SKIP  test");
    expect(result.output).toContain("SKIP  check");
  });
});
