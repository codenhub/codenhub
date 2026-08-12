import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { PackageSelection } from "../workspace/select-packages.ts";
import type { CommandContext } from "./definition.ts";
import { attributeDiagnostics, createTypecheckCommand, shardEvenly } from "./typecheck-command.ts";

function createPackage(name: string, location: string, typecheck: string): WorkspacePackage {
  return {
    directory: `/repo/${location}`,
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: false,
    location,
    manifest: {},
    name,
    scripts: { build: "vite build", typecheck },
    unscopedName: name,
    workspaceDependencies: [],
  };
}

const error = createPackage("@codenhub/error", "packages/error", "tsc -b");
const kbd = createPackage("@codenhub/kbd", "packages/kbd", "tsc -b");
const store = createPackage("@codenhub/store", "packages/store", "tsc -b");
const docs = createPackage("@codenhub/docs", "apps/docs", "astro sync && tsc --noEmit");
const iconsDev = createPackage("@codenhub/icons-dev", "packages/icons/dev", "tsc -b");

/**
 * Plans a type-check run and returns the command lines it would run.
 *
 * `--dry-run` reports the plan without spawning a compiler, which is the whole of
 * what batching decides.
 */
async function planTypecheck(targets: readonly PackageSelection[], flags: readonly string[] = []): Promise<string[]> {
  const lines: string[] = [];
  const context: CommandContext = {
    options: parseArguments(["typecheck", "--dry-run", "--no-build", ...flags]).options,
    passthrough: [],
    reporter: createReporter({
      useColor: false,
      write: (message) => lines.push(message),
      writeError: (message) => lines.push(message),
    }),
    selection: { isImplicit: false, targets, unownedPaths: [] },
    tokens: [],
    workspace: { packages: targets.map(({ package: workspacePackage }) => workspacePackage), root: "/repo" },
  };
  await createTypecheckCommand().run(context);

  return lines.filter((line) => line.includes(":")).map((line) => line.trim());
}

describe("shardEvenly", () => {
  it("shouldDealItemsOutRatherThanSliceThemIntoBlocks", () => {
    expect(shardEvenly([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 3, 5],
      [2, 4],
    ]);
  });

  it("shouldDropTheGroupsItCouldNotFill", () => {
    expect(shardEvenly([1, 2], 5)).toEqual([[1], [2]]);
  });

  it("shouldKeepOneGroupWhenAskedForNone", () => {
    expect(shardEvenly([1, 2], 0)).toEqual([[1, 2]]);
  });

  it("shouldReturnNothingForNoItems", () => {
    expect(shardEvenly([], 4)).toEqual([]);
  });
});

describe("attributeDiagnostics", () => {
  it("shouldNameOnlyThePackagesADiagnosticWasReportedFor", () => {
    const output = [
      "packages/error/src/index.ts(3,1): error TS2304: Cannot find name 'x'.",
      "packages/error/src/other.ts(9,2): error TS2304: Cannot find name 'y'.",
    ].join("\n");

    expect([...attributeDiagnostics(output, [error, kbd, store])]).toEqual(["@codenhub/error"]);
  });

  it("shouldReadDiagnosticsThatUseTheOtherPlatformSeparators", () => {
    const output = String.raw`packages\kbd\src\index.ts(1,1): error TS1005: ';' expected.`;

    expect([...attributeDiagnostics(output, [error, kbd])]).toEqual(["@codenhub/kbd"]);
  });

  it("shouldCreditTheNestedPackageRatherThanTheOneThatContainsIt", () => {
    const iconsPackage = createPackage("@codenhub/icons", "packages/icons", "tsc -b");
    const output = "packages/icons/dev/src/main.ts(4,4): error TS2551: Property does not exist.";

    expect([...attributeDiagnostics(output, [iconsPackage, iconsDev])]).toEqual(["@codenhub/icons-dev"]);
  });

  it("shouldNameNothingForADiagnosticWithoutAFile", () => {
    const output = "error TS2688: Cannot find type definition file for 'node'.";

    expect([...attributeDiagnostics(output, [error, kbd])]).toEqual([]);
  });
});

describe("createTypecheckCommand", () => {
  it("shouldCheckEveryBatchablePackageInOneCompilerRun", async () => {
    const commands = await planTypecheck(
      [error, kbd, store].map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      ["--parallel=1"],
    );

    expect(commands).toEqual([
      "/repo: tsc -b packages/error/tsconfig.json packages/kbd/tsconfig.json packages/store/tsconfig.json",
    ]);
  });

  it("shouldSpreadTheProjectsOverTheAvailableSlots", async () => {
    const commands = await planTypecheck(
      [error, kbd, store].map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      ["--parallel=2"],
    );

    expect(commands).toEqual([
      "/repo: tsc -b packages/error/tsconfig.json packages/store/tsconfig.json",
      "/repo: tsc -b packages/kbd/tsconfig.json",
    ]);
  });

  it("shouldLeaveAPackageWithItsOwnTypecheckScriptOutOfTheBatch", async () => {
    const commands = await planTypecheck(
      [error, docs].map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      ["--parallel=2"],
    );

    expect(commands).toEqual([
      "/repo/apps/docs: astro sync && tsc --noEmit",
      "/repo: tsc -b packages/error/tsconfig.json",
    ]);
  });

  it("shouldForwardToolArgumentsToTheCompiler", async () => {
    const lines: string[] = [];
    const context: CommandContext = {
      options: parseArguments(["typecheck", "--dry-run", "--no-build"]).options,
      passthrough: ["--listFiles"],
      reporter: createReporter({ useColor: false, write: (message) => lines.push(message) }),
      selection: { isImplicit: false, targets: [{ package: error, paths: [] }], unownedPaths: [] },
      tokens: [],
      workspace: { packages: [error], root: "/repo" },
    };
    await createTypecheckCommand().run(context);

    expect(lines.join("\n")).toContain("tsc -b packages/error/tsconfig.json --listFiles");
  });

  it("shouldReportNothingToDoWhenNoPackageTypeChecks", async () => {
    const lines: string[] = [];
    const withoutScript: WorkspacePackage = { ...error, scripts: { build: "vite build" } };
    const context: CommandContext = {
      options: parseArguments(["typecheck"]).options,
      passthrough: [],
      reporter: createReporter({
        useColor: false,
        write: (message) => lines.push(message),
        writeError: (message) => lines.push(message),
      }),
      selection: { isImplicit: false, targets: [{ package: withoutScript, paths: [] }], unownedPaths: [] },
      tokens: [],
      workspace: { packages: [withoutScript], root: "/repo" },
    };

    expect(await createTypecheckCommand().run(context)).toBe(0);
    expect(lines.join("\n")).toContain('No selected package defines a "typecheck" script.');
  });
});
