import { describe, expect, it, vi } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import type { ReadinessOptions, ReleaseRunner } from "../release/readiness.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";
import { createReleaseCommand } from "./release-command.ts";

function createPackage(name: string, isPrivate = false): WorkspacePackage {
  const unscopedName = name.slice(name.lastIndexOf("/") + 1);
  return {
    directory: `/repo/packages/${unscopedName}`,
    directoryName: unscopedName,
    isPrivate,
    location: `packages/${unscopedName}`,
    manifest: {
      exports: { ".": "./dist/index.js" },
      name,
      private: isPrivate,
      version: "1.0.0",
    },
    name,
    scripts: {},
    unscopedName,
    workspaceDependencies: [],
  };
}

/** Answers `npm view` with a published version and `git status` with a clean tree. */
const runner: ReleaseRunner = vi.fn(async (command: string) =>
  command === "npm" ? { isSuccess: true, stdout: JSON.stringify("0.9.0") } : { isSuccess: true, stdout: "" },
);

const readiness: ReadinessOptions = { readPack: async () => new Set(["dist/index.js"]), run: runner };

interface RunResult {
  exitCode: number;
  output: string;
  errors: string;
  verified: string[];
}

async function runRelease(
  packages: readonly WorkspacePackage[],
  argv: readonly string[],
  verifyExitCode = EXIT_SUCCESS,
): Promise<RunResult> {
  const lines: string[] = [];
  const errors: string[] = [];
  const verified: string[] = [];
  const resolver = (name: string): CommandDefinition => ({
    name,
    run: async () => {
      verified.push(name);
      return verifyExitCode;
    },
    summary: name,
    usage: name,
  });
  const parsed = parseArguments(["release", ...argv]);
  const context: CommandContext = {
    options: parsed.options,
    passthrough: parsed.passthrough,
    reporter: createReporter({
      useColor: false,
      write: (line) => lines.push(line),
      writeError: (line) => errors.push(line),
    }),
    selection: {
      isImplicit: true,
      targets: packages.map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      unownedPaths: [],
    },
    tokens: [],
    workspace: { packages, root: "/repo" },
  };

  // The command has to finish before the captured output is read: an object
  // literal evaluates its properties in source order.
  const exitCode = await createReleaseCommand(resolver, readiness).run(context);
  return { errors: errors.join("\n"), exitCode, output: lines.join("\n"), verified };
}

describe("hub release", () => {
  it("reports nothing to do when no selected package is published", async () => {
    const result = await runRelease([createPackage("@codenhub/debug", true)], ["--skip-verify"]);

    expect(result.errors).toContain("No selected package is published.");
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("verifies before it reports readiness", async () => {
    const result = await runRelease([createPackage("@codenhub/error")], []);

    expect(result.verified).toEqual(["verify"]);
    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("stops at a failing verification rather than reporting a package ready", async () => {
    const result = await runRelease([createPackage("@codenhub/error")], [], EXIT_FAILURE);

    expect(result.errors).toContain("Verification failed");
    expect(result.output).not.toContain("ready to publish");
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });

  it("skips verification on request", async () => {
    const result = await runRelease([createPackage("@codenhub/error")], ["--skip-verify"]);

    expect(result.verified).toEqual([]);
    expect(result.output).toContain("ready to publish");
  });

  it("leaves private packages out of the report", async () => {
    const packages = [createPackage("@codenhub/error"), createPackage("@codenhub/debug", true)];

    const result = await runRelease(packages, ["--skip-verify"]);

    expect(result.output).toContain("@codenhub/error");
    expect(result.output).not.toContain("@codenhub/debug");
  });

  it("fails when a precondition blocks publication", async () => {
    const blocked = createPackage("@codenhub/error");
    (blocked.manifest as Record<string, unknown>).version = "0.1.0";

    const result = await runRelease([blocked], ["--skip-verify"]);

    expect(result.output).toContain("is not newer than the published 0.9.0");
    expect(result.exitCode).toBe(EXIT_FAILURE);
  });
});
