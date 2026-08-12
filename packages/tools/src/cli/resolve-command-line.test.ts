import { describe, expect, it } from "vitest";

import type { Workspace, WorkspacePackage } from "../workspace/discover.ts";
import { parseArguments } from "./parse-arguments.ts";
import { resolveCommandLine } from "./resolve-command-line.ts";

function createPackage(name: string, scripts: Readonly<Record<string, string>>): WorkspacePackage {
  return {
    directory: `/repo/packages/${name}`,
    directoryName: name,
    isPrivate: false,
    location: `packages/${name}`,
    manifest: {},
    name: `@codenhub/${name}`,
    scripts,
    unscopedName: name,
    workspaceDependencies: [],
  };
}

const workspace: Workspace = {
  packages: [createPackage("styles", { dev: "vite" }), createPackage("error", { test: "vitest run" })],
  root: "/repo",
};

describe("resolveCommandLine", () => {
  it("shouldResolveAPackageBeforeItsScript", () => {
    const resolved = resolveCommandLine(parseArguments(["styles", "dev"]), workspace);

    expect(resolved.commandName).toBe("dev");
    expect(resolved.tokens).toEqual(["styles"]);
  });

  it("shouldLeaveCommandFirstInvocationsUnchanged", () => {
    const parsed = parseArguments(["test", "error"]);

    expect(resolveCommandLine(parsed, workspace)).toBe(parsed);
  });

  it("shouldGiveRegisteredCommandsPrecedenceOverPackageAliases", () => {
    const conflictingWorkspace: Workspace = {
      packages: [...workspace.packages, createPackage("test", { dev: "vite" })],
      root: "/repo",
    };
    const parsed = parseArguments(["test", "dev"]);

    expect(resolveCommandLine(parsed, conflictingWorkspace)).toBe(parsed);
  });
});
