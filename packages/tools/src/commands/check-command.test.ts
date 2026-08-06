import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { createCheckCommand } from "./check-command.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext } from "./definition.ts";

const REGISTER_DIRECTORY = "docs/specs";
const REGISTER_FILE = "docs/specs/packages-exceptions.md";

// Every fixture is private and declares no documentation metadata, so only the
// rules that read the manifest apply and no rule touches the filesystem.
function createPackage(name: string, manifest: Record<string, unknown> = {}): WorkspacePackage {
  const unscopedName = name.slice(name.lastIndexOf("/") + 1);
  const location = `packages/${unscopedName}`;
  return {
    directory: join("/repo", location),
    directoryName: unscopedName,
    isPrivate: true,
    location,
    manifest: { ...manifest, private: true },
    name,
    scripts: (manifest.scripts as Record<string, string>) ?? {},
    unscopedName,
    workspaceDependencies: [],
  };
}

/** Chaining a build into `test` is an error finding on any package. */
function createChainedBuildPackage(name: string): WorkspacePackage {
  return createPackage(name, { scripts: { test: "pnpm build && vitest run" } });
}

/** A non-workspace range on a workspace package is a warning finding. */
function createLooseDependencyPackage(name: string, dependency: string): WorkspacePackage {
  return createPackage(name, { dependencies: { [dependency]: "^1.0.0" } });
}

interface RunResult {
  exitCode: number;
  output: string;
}

async function runCheck(packages: readonly WorkspacePackage[], register?: string): Promise<RunResult> {
  const root = await mkdtemp(join(tmpdir(), "codenhub-check-"));
  if (register !== undefined) {
    await mkdir(join(root, REGISTER_DIRECTORY), { recursive: true });
    await writeFile(join(root, REGISTER_FILE), register, "utf8");
  }

  const lines: string[] = [];
  const context: CommandContext = {
    options: parseArguments(["check"]).options,
    passthrough: [],
    reporter: createReporter({ useColor: false, write: (line) => lines.push(line), writeError: () => {} }),
    selection: {
      isImplicit: true,
      targets: packages.map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      unownedPaths: [],
    },
    workspace: { packages, root },
  };

  return { exitCode: await createCheckCommand().run(context), output: lines.join("\n") };
}

function createWaiver(name: string, codes: readonly string[]): string {
  const bypassed = codes.map((code) => `\`${code}\``).join(", ");
  return [`## \`${name}\`: documented reason`, "", `- **Checks bypassed:** ${bypassed}.`].join("\n");
}

describe("hub check", () => {
  it("passes a compliant package", async () => {
    const result = await runCheck([createPackage("@codenhub/tools")]);

    expect(result.exitCode).toBe(EXIT_SUCCESS);
    expect(result.output).toContain("PASS");
  });

  it("fails the run when a package has an error finding", async () => {
    const result = await runCheck([createChainedBuildPackage("@codenhub/error")]);

    expect(result.exitCode).toBe(EXIT_FAILURE);
    expect(result.output).toContain("scripts/build-chain");
  });

  it("keeps the run passing when only warnings are found", async () => {
    const result = await runCheck([
      createLooseDependencyPackage("@codenhub/error", "@codenhub/theme"),
      createPackage("@codenhub/theme"),
    ]);

    expect(result.exitCode).toBe(EXIT_SUCCESS);
    expect(result.output).toContain("dependencies/workspace-range");
    expect(result.output).toContain("WARN");
  });

  it("inspects every package rather than stopping at the first failure", async () => {
    const result = await runCheck([
      createChainedBuildPackage("@codenhub/error"),
      createChainedBuildPackage("@codenhub/kbd"),
    ]);

    expect(result.output).toContain("@codenhub/error");
    expect(result.output).toContain("@codenhub/kbd");
  });

  it("suppresses a finding waived by the exception register", async () => {
    const result = await runCheck(
      [createChainedBuildPackage("@codenhub/error")],
      createWaiver("@codenhub/error", ["scripts/build-chain"]),
    );

    expect(result.exitCode).toBe(EXIT_SUCCESS);
    expect(result.output).not.toContain("scripts/build-chain:");
    expect(result.output).toContain("1 waived");
  });

  it("waives a finding only for the package the register names", async () => {
    const result = await runCheck(
      [createChainedBuildPackage("@codenhub/error"), createChainedBuildPackage("@codenhub/kbd")],
      createWaiver("@codenhub/error", ["scripts/build-chain"]),
    );

    expect(result.exitCode).toBe(EXIT_FAILURE);
    expect(result.output).toContain("scripts/build-chain");
  });

  it("reports a waived code that suppresses nothing", async () => {
    const result = await runCheck(
      [createChainedBuildPackage("@codenhub/error")],
      createWaiver("@codenhub/error", ["scripts/build-chain", "scripts/buld-chain"]),
    );

    expect(result.output).toContain("Exception register");
    expect(result.output).toContain("waives nothing: scripts/buld-chain");
  });

  it("reports a register entry naming a package outside the workspace", async () => {
    const result = await runCheck(
      [createPackage("@codenhub/error")],
      createWaiver("@codenhub/gone", ["scripts/build-chain"]),
    );

    expect(result.output).toContain("@codenhub/gone");
    expect(result.output).toContain("no workspace package has this name");
  });

  it("keeps a dead waiver from failing the run", async () => {
    const result = await runCheck(
      [createPackage("@codenhub/error")],
      createWaiver("@codenhub/error", ["scripts/buld-chain"]),
    );

    expect(result.exitCode).toBe(EXIT_SUCCESS);
  });

  it("stays quiet about the register when every waiver is used", async () => {
    const result = await runCheck(
      [createChainedBuildPackage("@codenhub/error")],
      createWaiver("@codenhub/error", ["scripts/build-chain"]),
    );

    expect(result.output).not.toContain("Exception register");
  });

  it("emits findings and waivers as JSON on request", async () => {
    const root = await mkdtemp(join(tmpdir(), "codenhub-check-"));
    const packages = [createChainedBuildPackage("@codenhub/error")];
    const lines: string[] = [];
    const context: CommandContext = {
      options: parseArguments(["check", "--json"]).options,
      passthrough: [],
      reporter: createReporter({ useColor: false, write: (line) => lines.push(line), writeError: () => {} }),
      selection: {
        isImplicit: true,
        targets: packages.map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
        unownedPaths: [],
      },
      workspace: { packages, root },
    };

    await createCheckCommand().run(context);

    expect(JSON.parse(lines.join("\n"))).toEqual([
      {
        findings: [
          {
            code: "scripts/build-chain",
            location: "package.json",
            message: expect.stringContaining("must not chain a build"),
            severity: "error",
          },
        ],
        package: "@codenhub/error",
        unusedWaivers: [],
        waived: 0,
      },
    ]);
  });
});
