import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { CommandContext } from "./definition.ts";
import { resolveCommand } from "./registry.ts";

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
});
