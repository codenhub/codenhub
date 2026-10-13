import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { CommandContext } from "./definition.ts";
import { resolveCommand } from "./registry.ts";

function fixturePackage(name: string, scripts: Record<string, string>): WorkspacePackage {
  return {
    directory: process.cwd(),
    directoryName: name,
    isPrivate: true,
    location: `packages/${name}`,
    manifest: {},
    name: `@fixture/${name}`,
    scripts,
    unscopedName: name,
    workspaceDependencies: [],
  };
}

function fixtureContext(
  packages: WorkspacePackage[],
  selected: WorkspacePackage[],
): { context: CommandContext; stderr: string[] } {
  const stderr: string[] = [];
  const context: CommandContext = {
    options: parseArguments([]).options,
    passthrough: [],
    reporter: createReporter({
      useColor: false,
      write: () => undefined,
      writeError: (message) => stderr.push(message),
    }),
    selection: {
      isImplicit: false,
      targets: selected.map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      unownedPaths: [],
    },
    tokens: [],
    workspace: { packages, root: process.cwd() },
  };
  return { context, stderr };
}

describe("resolveCommand", () => {
  it("shouldRunLongRunningFallbackScriptsWithoutTheDefaultTimeout", async () => {
    const workspacePackage: WorkspacePackage = {
      directory: process.cwd(),
      directoryName: "example",
      isPrivate: true,
      location: "packages/example",
      manifest: {},
      name: "@fixture/example",
      scripts: { dev: `"${process.execPath}" -e "setTimeout(() => {}, 50)"` },
      unscopedName: "example",
      workspaceDependencies: [],
    };
    const context: CommandContext = {
      options: parseArguments(["dev", "--timeout=0.001"]).options,
      passthrough: [],
      reporter: createReporter({ useColor: false, write: () => undefined, writeError: () => undefined }),
      selection: { isImplicit: false, targets: [{ package: workspacePackage, paths: [] }], unownedPaths: [] },
      tokens: [],
      workspace: { packages: [workspacePackage], root: process.cwd() },
    };

    await expect(resolveCommand("dev").run(context)).resolves.toBe(0);
  });

  it("shouldFailAnUnknownNameThatNoWorkspacePackageDefines", async () => {
    const built = fixturePackage("built", { build: "tsc" });
    const { context, stderr } = fixtureContext([built], [built]);

    await expect(resolveCommand("verfiy").run(context)).resolves.toBe(1);
    expect(stderr.join("\n")).toMatch(/error Unknown command "verfiy": no workspace package defines a "verfiy" script/);
  });

  it("shouldStillWarnWhenOnlyUnselectedPackagesDefineTheScript", async () => {
    const debuggable = fixturePackage("debuggable", { debug: "tsx watch" });
    const plain = fixturePackage("plain", { build: "tsc" });
    const { context, stderr } = fixtureContext([debuggable, plain], [plain]);

    await expect(resolveCommand("debug").run(context)).resolves.toBe(0);
    expect(stderr.join("\n")).toMatch(/warn No selected package defines a "debug" script/);
  });

  it("shouldKeepTheWarningForDedicatedCommandsBuiltFromScripts", async () => {
    const built = fixturePackage("built", { build: "tsc" });
    const { context, stderr } = fixtureContext([built], [built]);

    await expect(resolveCommand("status:npm").run(context)).resolves.toBe(0);
    expect(stderr.join("\n")).toMatch(/warn No selected package defines a "status:npm" script/);
  });
});
