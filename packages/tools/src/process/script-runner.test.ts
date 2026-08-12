import { delimiter, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { execute } from "./execute.ts";
import {
  buildScriptSpec,
  needsPackageManager,
  quoteShellArgument,
  resolveBinDirectories,
  withBinPath,
} from "./script-runner.ts";

const isWindows = process.platform === "win32";

function createPackage(scripts: Readonly<Record<string, string>>): WorkspacePackage {
  return {
    directory: join("/repo", "packages", "error"),
    directoryName: "error",
    isPrivate: false,
    location: "packages/error",
    manifest: {},
    name: "@codenhub/error",
    scripts,
    unscopedName: "error",
    workspaceDependencies: [],
  };
}

describe("resolveBinDirectories", () => {
  it("shouldWalkFromThePackageUpToTheRepositoryRoot", () => {
    const directories = resolveBinDirectories(join("/repo", "packages", "error"), "/repo");

    expect(directories).toEqual([
      resolve("/repo", "packages", "error", "node_modules", ".bin"),
      resolve("/repo", "packages", "node_modules", ".bin"),
      resolve("/repo", "node_modules", ".bin"),
    ]);
  });

  it("shouldStopAtTheFilesystemRootWhenTheRootIsUnreachable", () => {
    expect(resolveBinDirectories(join("/elsewhere"), "/repo").length).toBeGreaterThan(0);
  });
});

describe("withBinPath", () => {
  it("shouldPrependBinDirectoriesToTheInheritedPath", () => {
    const environment = withBinPath(["/a/bin", "/b/bin"], { PATH: "/usr/bin" });

    expect(environment.PATH).toBe(["/a/bin", "/b/bin", "/usr/bin"].join(delimiter));
  });

  it("shouldReplaceAnExistingPathRegardlessOfItsCase", () => {
    const environment = withBinPath(["/a/bin"], { Path: "/usr/bin" });

    expect(environment.Path).toBe(["/a/bin", "/usr/bin"].join(delimiter));
    expect(environment.PATH).toBeUndefined();
  });

  it("shouldSetThePathWhenNoneWasInherited", () => {
    expect(withBinPath(["/a/bin"], {}).PATH).toBe("/a/bin");
  });
});

describe("quoteShellArgument", () => {
  it("shouldLeaveAPlainArgumentAlone", () => {
    expect(quoteShellArgument("src/index.test.ts")).toBe("src/index.test.ts");
  });

  it("shouldQuoteAnArgumentContainingSpaces", () => {
    expect(quoteShellArgument("two words")).toContain("two words");
    expect(quoteShellArgument("two words")).not.toBe("two words");
  });
});

describe("needsPackageManager", () => {
  it("shouldDeferToThePackageManagerForAScriptWithHooks", () => {
    expect(needsPackageManager(createPackage({ pretest: "echo", test: "vitest run" }), "test")).toBe(true);
    expect(needsPackageManager(createPackage({ posttest: "echo", test: "vitest run" }), "test")).toBe(true);
  });

  it("shouldRunAHookFreeScriptItself", () => {
    expect(needsPackageManager(createPackage({ test: "vitest run" }), "test")).toBe(false);
  });
});

describe("buildScriptSpec", () => {
  it("shouldRunTheScriptBodyThroughTheShell", () => {
    const spec = buildScriptSpec(createPackage({ typecheck: "tsc --noEmit" }), "typecheck", [], "/repo");

    expect(spec.shell).toBe(true);
    expect(spec.command).toBe("tsc --noEmit");
    expect(spec.args).toEqual([]);
  });

  it("shouldAppendForwardedArgumentsToTheScriptBody", () => {
    const spec = buildScriptSpec(createPackage({ test: "vitest run" }), "test", ["src/a.test.ts"], "/repo");

    expect(spec.command).toBe("vitest run src/a.test.ts");
  });

  it("shouldPutThePackageBinDirectoriesOnThePath", () => {
    const spec = buildScriptSpec(createPackage({ test: "vitest run" }), "test", [], "/repo");
    const path = Object.entries(spec.env ?? {}).find(([key]) => key.toUpperCase() === "PATH")?.[1];

    expect(path).toContain(resolve("/repo", "packages", "error", "node_modules", ".bin"));
    expect(path).toContain(resolve("/repo", "node_modules", ".bin"));
  });

  it("shouldFallBackToThePackageManagerForAScriptWithHooks", () => {
    const spec = buildScriptSpec(createPackage({ pretest: "echo", test: "vitest run" }), "test", [], "/repo");

    expect(spec.shell).toBeUndefined();
    expect(spec.command).toBe("pnpm");
    expect(spec.args).toEqual(["--silent", "run", "test"]);
  });

  it("shouldRunAChainedScriptBodyToCompletion", async () => {
    const script = isWindows ? "echo first && echo second" : "echo first && echo second";
    const outcome = await execute({ args: [], command: script, cwd: process.cwd(), shell: true }, { stdio: "pipe" });

    expect(outcome.isSuccess).toBe(true);
    expect(outcome.output).toContain("first");
    expect(outcome.output).toContain("second");
  });

  it("shouldReportAFailingScriptBodyAsAFailure", async () => {
    const outcome = await execute(
      { args: [], command: `"${process.execPath}" -e "process.exit(4)"`, cwd: process.cwd(), shell: true },
      { stdio: "pipe" },
    );

    expect(outcome.isSuccess).toBe(false);
    expect(outcome.exitCode).toBe(4);
  });
});
