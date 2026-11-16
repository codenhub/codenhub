import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { Workspace, WorkspacePackage } from "../workspace/discover.ts";
import { EXIT_FAILURE, EXIT_SUCCESS } from "./definition.ts";
import { createDeployAffectedCommand, type DeployAffectedDependencies } from "./deploy-affected-command.ts";

function createPackage(location: string): WorkspacePackage {
  const name = `@fixture/${location.slice(location.lastIndexOf("/") + 1)}`;
  return {
    directory: `/repo/${location}`,
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: true,
    location,
    manifest: { name },
    name,
    scripts: {},
    unscopedName: name.slice(name.indexOf("/") + 1),
    workspaceDependencies: [],
  };
}

const workspace: Workspace = {
  packages: [createPackage("apps/www"), createPackage("apps/docs"), createPackage("apps/demo")],
  root: "/repo",
};

interface RunResult {
  exitCode: number;
  output: string[];
  errors: string[];
  comparedWith: string[];
}

async function run(
  argv: readonly string[],
  dependencies: Partial<DeployAffectedDependencies> = {},
): Promise<RunResult> {
  const output: string[] = [];
  const errors: string[] = [];
  const comparedWith: string[] = [];
  const parsed = parseArguments(["deploy:affected", ...argv]);
  const command = createDeployAffectedCommand({
    findChangedPaths: async (_root, ref) => {
      comparedWith.push(ref);
      return ["apps/docs/src/pages/index.astro"];
    },
    refExists: async () => true,
    ...dependencies,
  });
  const exitCode = await command.run({
    options: parsed.options,
    passthrough: parsed.passthrough,
    reporter: createReporter({ write: (line) => output.push(line), writeError: (line) => errors.push(line) }),
    selection: { isImplicit: false, targets: [], unownedPaths: [] },
    tokens: parsed.tokens,
    workspace,
  });
  return { comparedWith, errors, exitCode, output };
}

describe("hub deploy:affected", () => {
  it("prints one affected site per line, compared with the given ref", async () => {
    const result = await run(["--changed=abc123"]);
    expect(result).toMatchObject({ comparedWith: ["abc123"], exitCode: EXIT_SUCCESS, output: ["docs"] });
  });

  it("prints a JSON array with --json", async () => {
    const result = await run(["--changed=abc123", "--json"]);
    expect(JSON.parse(result.output.join("\n"))).toEqual(["docs"]);
  });

  it("prints nothing when no site is affected", async () => {
    const result = await run(["--changed=abc123"], { findChangedPaths: async () => ["docs/ci.md"] });
    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, output: [] });
  });

  // An unknown ref would compare nothing and report no site, which reads as "nothing to deploy".
  it("fails when the ref does not name a commit", async () => {
    const result = await run(["--changed=missing"], { refExists: async () => false });
    expect(result.exitCode).toBe(EXIT_FAILURE);
    expect(result.output).toEqual([]);
    expect(result.errors.join("\n")).toContain("missing");
  });

  it("fails without --changed, since comparing main with itself would select nothing", async () => {
    const result = await run([]);
    expect(result.exitCode).toBe(EXIT_FAILURE);
    expect(result.errors.join("\n")).toContain("--changed=<ref>");
  });
});
