import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { PackageSelection } from "../workspace/select-packages.ts";
import type { CommandContext } from "./definition.ts";
import { createScriptCommand } from "./script-command.ts";

function createPackage(name: string, location: string, workspaceDependencies: readonly string[]): WorkspacePackage {
  return {
    directory: `/repo/${location}`,
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: false,
    location,
    manifest: {},
    name,
    scripts: { build: "vite build" },
    unscopedName: name,
    workspaceDependencies,
  };
}

const styles = createPackage("styles", "packages/styles", []);
const kbd = createPackage("kbd", "packages/kbd", []);
const docs = createPackage("docs", "apps/docs", ["styles", "kbd"]);

interface RunOptions {
  targets: readonly PackageSelection[];
  flags?: readonly string[];
  includesDependencies?: boolean;
}

/**
 * Plans a `build` run and returns the package locations it would build, in order.
 *
 * `--dry-run` reports the plan without spawning package managers, which is the
 * whole of what dependency ordering decides.
 */
async function planBuild({ flags = [], includesDependencies = true, targets }: RunOptions): Promise<string[]> {
  const lines: string[] = [];
  const context: CommandContext = {
    options: parseArguments(["build", "--dry-run", ...flags]).options,
    passthrough: [],
    reporter: createReporter({
      useColor: false,
      write: (message) => lines.push(message),
      writeError: (message) => lines.push(message),
    }),
    selection: { isImplicit: false, targets, unownedPaths: [] },
    tokens: [],
    // Discovery orders packages by location, which lists the dependent first.
    workspace: { packages: [docs, kbd, styles], root: "/repo" },
  };
  await createScriptCommand({ includesDependencies, name: "build", summary: "Build the selected packages." }).run(
    context,
  );

  return lines
    .filter((line) => line.includes("vite build"))
    .map((line) => line.trim().split(":")[0] as string)
    .map((directory) => directory.replace("/repo/", ""));
}

describe("createScriptCommand", () => {
  it("shouldBuildWorkspaceDependenciesBeforeTheSelectedPackage", async () => {
    expect(await planBuild({ targets: [{ package: docs, paths: [] }] })).toEqual([
      "packages/styles",
      "packages/kbd",
      "apps/docs",
    ]);
  });

  it("shouldOrderTheSelectionDependencyFirstWithoutExpandingIt", async () => {
    const locations = await planBuild({
      flags: ["--no-deps"],
      targets: [
        { package: docs, paths: [] },
        { package: kbd, paths: [] },
        { package: styles, paths: [] },
      ],
    });

    expect(locations).toEqual(["packages/styles", "packages/kbd", "apps/docs"]);
  });

  it("shouldNarrowToTheSelectedPackagesWithNoDeps", async () => {
    expect(await planBuild({ flags: ["--no-deps"], targets: [{ package: docs, paths: [] }] })).toEqual(["apps/docs"]);
  });

  it("shouldLeaveTheSelectionAloneForCommandsThatDoNotOwnBuildOrder", async () => {
    const locations = await planBuild({
      includesDependencies: false,
      targets: [
        { package: docs, paths: [] },
        { package: styles, paths: [] },
      ],
    });

    expect(locations).toEqual(["apps/docs", "packages/styles"]);
  });

  it("shouldNotTimeOutPreparationForAnInteractiveCommand", async () => {
    const interactivePackage: WorkspacePackage = {
      ...styles,
      directory: process.cwd(),
      scripts: { debug: `"${process.execPath}" -e ""` },
    };
    const context: CommandContext = {
      options: parseArguments(["debug", "--timeout=0.001"]).options,
      passthrough: [],
      reporter: createReporter({ useColor: false, write: () => undefined, writeError: () => undefined }),
      selection: { isImplicit: false, targets: [{ package: interactivePackage, paths: [] }], unownedPaths: [] },
      tokens: [],
      workspace: { packages: [interactivePackage], root: process.cwd() },
    };
    const command = createScriptCommand({
      isInteractive: true,
      name: "debug",
      prepare: async () => [
        { args: ["-e", "setTimeout(() => {}, 50)"], command: process.execPath, cwd: process.cwd() },
      ],
      summary: "Debug the selected package.",
    });

    await expect(command.run(context)).resolves.toBe(0);
  });

  it("shouldGiveEachConcurrentPackageItsShareOfTheWorkerPool", async () => {
    const lines: string[] = [];
    const script = `"${process.execPath}" -e "console.log('workers=' + process.env.HUB_TEST_WORKERS)"`;
    const packages = ["one", "two"].map<WorkspacePackage>((name) => ({
      ...createPackage(name, `packages/${name}`, []),
      directory: process.cwd(),
      scripts: { test: script },
    }));
    const context: CommandContext = {
      options: parseArguments(["test", "--parallel=2", "--verbose", "--no-build"]).options,
      passthrough: [],
      reporter: createReporter({
        useColor: false,
        write: (message) => lines.push(message),
        writeError: (message) => lines.push(message),
      }),
      selection: {
        isImplicit: false,
        targets: packages.map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
        unownedPaths: [],
      },
      tokens: [],
      workspace: { packages, root: process.cwd() },
    };
    const command = createScriptCommand({
      name: "test",
      summary: "Run tests.",
      workerPool: { capacity: () => 4, variable: "HUB_TEST_WORKERS" },
    });

    await expect(command.run(context)).resolves.toBe(0);
    expect(lines.join("\n").match(/workers=\d+/g)).toEqual(["workers=2", "workers=2"]);
  });

  it("shouldGiveTheWholeWorkerPoolToTheOnlyPackageThatRuns", async () => {
    const lines: string[] = [];
    const only: WorkspacePackage = {
      ...createPackage("only", "packages/only", []),
      directory: process.cwd(),
      scripts: { test: `"${process.execPath}" -e "console.log('workers=' + process.env.HUB_TEST_WORKERS)"` },
    };
    const context: CommandContext = {
      options: parseArguments(["test", "--parallel=6", "--verbose", "--no-build"]).options,
      passthrough: [],
      reporter: createReporter({
        useColor: false,
        write: (message) => lines.push(message),
        writeError: (message) => lines.push(message),
      }),
      selection: { isImplicit: false, targets: [{ package: only, paths: [] }], unownedPaths: [] },
      tokens: [],
      workspace: { packages: [only], root: process.cwd() },
    };
    const command = createScriptCommand({
      name: "test",
      summary: "Run tests.",
      workerPool: { capacity: () => 4, variable: "HUB_TEST_WORKERS" },
    });

    await expect(command.run(context)).resolves.toBe(0);
    expect(lines.join("\n").match(/workers=\d+/g)).toEqual(["workers=4"]);
  });

  describe("a package's own time limit", () => {
    /* The script outlives the declared 0.1 seconds by a wide margin, so a run
       that honours the declaration is killed and one that does not finishes. */
    async function runSlowPackage(flags: readonly string[], declared: unknown): Promise<number> {
      const slow: WorkspacePackage = {
        ...createPackage("slow", "packages/slow", []),
        directory: process.cwd(),
        manifest: { codenhub: { tools: { timeout: declared } } },
        scripts: { test: `"${process.execPath}" -e "setTimeout(() => {}, 1500)"` },
      };
      const context: CommandContext = {
        options: parseArguments(["test", "--no-build", ...flags]).options,
        passthrough: [],
        reporter: createReporter({ useColor: false, write: () => undefined, writeError: () => undefined }),
        selection: { isImplicit: false, targets: [{ package: slow, paths: [] }], unownedPaths: [] },
        tokens: [],
        workspace: { packages: [slow], root: process.cwd() },
      };

      return createScriptCommand({ name: "test", summary: "Run tests." }).run(context);
    }

    it("shouldApplyTheLimitAPackageDeclaresInPlaceOfTheDefault", async () => {
      await expect(runSlowPackage([], 0.1)).resolves.toBe(1);
    });

    it("shouldLetTheCallerSetTheLimitOverWhatThePackageDeclares", async () => {
      await expect(runSlowPackage(["--timeout=30"], 0.1)).resolves.toBe(0);
    });

    it("shouldLetTheCallerRemoveTheLimitOverWhatThePackageDeclares", async () => {
      await expect(runSlowPackage(["--no-timeout"], 0.1)).resolves.toBe(0);
    });

    it("shouldApplyTheCallerLimitEvenWhenThePackageDeclaresALongerOne", async () => {
      await expect(runSlowPackage(["--timeout=0.1"], 30)).resolves.toBe(1);
    });

    it.each([0, -1, "1800"])("shouldRejectAMalformedDeclarationOf%s", async (declared) => {
      await expect(runSlowPackage([], declared)).rejects.toThrow(/Invalid codenhub\.tools\.timeout in slow/);
    });
  });
});
