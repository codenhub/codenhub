import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import type * as FileSystem from "node:fs/promises";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { execute } from "../process/execute.ts";
import type * as ProcessExecution from "../process/execute.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { Selection } from "../workspace/select-packages.ts";
import type { CommandContext } from "./definition.ts";
import { createRootToolCommand, resolveToolPaths } from "./root-tool-command.ts";
import { runPackageBatch } from "./script-command.ts";

vi.mock("../process/execute.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof ProcessExecution>()),
  execute: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof FileSystem>()),
  mkdir: vi.fn(),
  mkdtemp: vi.fn(),
  writeFile: vi.fn(),
}));

function createPackage(name: string, location: string): WorkspacePackage {
  return {
    directory: `/repo/${location}`,
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: false,
    manifest: {},
    location,
    name,
    scripts: {},
    unscopedName: name,
    workspaceDependencies: [],
  };
}

const error = createPackage("error", "packages/error");
const kbd = createPackage("kbd", "packages/kbd");

function createContext(selection: Selection): CommandContext {
  return {
    options: parseArguments(["lint"]).options,
    passthrough: [],
    reporter: createReporter({ useColor: false, write: () => {}, writeError: () => {} }),
    selection,
    tokens: [],
    workspace: { packages: [error, kbd], root: "/repo" },
  };
}

describe("resolveToolPaths", () => {
  it("shouldFallBackToTheDefaultPathsWhenNothingWasSelected", () => {
    const context = createContext({ isImplicit: true, targets: [{ package: error, paths: [] }], unownedPaths: [] });

    expect(resolveToolPaths(context, ["."])).toEqual(["."]);
  });

  it("shouldUsePackageDirectoriesForWholePackageSelections", () => {
    const context = createContext({
      isImplicit: false,
      targets: [
        { package: error, paths: [] },
        { package: kbd, paths: [] },
      ],
      unownedPaths: [],
    });

    expect(resolveToolPaths(context, ["."])).toEqual(["packages/error", "packages/kbd"]);
  });

  it("shouldUseRepositoryRelativePathsForNarrowedSelections", () => {
    const context = createContext({
      isImplicit: false,
      targets: [{ package: error, paths: ["src/index.ts", "src/result.ts"] }],
      unownedPaths: [],
    });

    expect(resolveToolPaths(context, ["."])).toEqual(["packages/error/src/index.ts", "packages/error/src/result.ts"]);
  });

  it("shouldIncludePathsOutsideEveryPackage", () => {
    const context = createContext({
      isImplicit: false,
      targets: [{ package: error, paths: [] }],
      unownedPaths: ["docs/tooling.md"],
    });

    expect(resolveToolPaths(context, ["."])).toEqual(["packages/error", "docs/tooling.md"]);
  });
});

describe("captured diagnostic output", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdtemp).mockResolvedValue(join("/repo", "logs", "hub", "output-test"));
  });

  async function report(output: string, flags: string[] = []): Promise<{ lines: string[]; exitCode: number }> {
    const lines: string[] = [];
    const context = createContext({ isImplicit: true, targets: [], unownedPaths: [] });
    context.options = parseArguments(["lint", ...flags]).options;
    context.reporter = createReporter({ useColor: false, write: (line) => lines.push(line) });
    vi.mocked(execute).mockResolvedValue({
      didTimeOut: false,
      durationMs: 1,
      exitCode: 1,
      isSuccess: false,
      output,
    });
    const exitCode = await createRootToolCommand({ command: "oxlint", name: "lint", summary: "Lint." }).run(context);
    return { exitCode, lines };
  }

  it("shouldBoundDisplayedOutputAndPreserveTheCompleteLog", async () => {
    const output = `FIRST\n${"x".repeat(20_000)}\nLAST\n`;
    const { exitCode, lines } = await report(output);
    const displayed = lines.join("\n");

    expect(exitCode).toBe(1);
    expect(displayed.length).toBeLessThanOrEqual(12_000);
    expect(displayed).toMatch(/^FIRST\n/);
    expect(displayed).toMatch(/\nLAST$/);
    expect(displayed).toMatch(/\d+ characters omitted/);
    expect(displayed).toContain(join("/repo", "logs", "hub", "output-test", "output.log"));
    expect(writeFile).toHaveBeenCalledWith(join("/repo", "logs", "hub", "output-test", "output.log"), output, "utf8");
  });

  it("shouldLeaveOutputAtTheLimitIntactWithoutWritingALog", async () => {
    const output = "x".repeat(12_000);
    const { lines } = await report(output);
    expect(lines).toHaveLength(1);
    expect(lines[0] === output).toBe(true);
    expect(mkdir).not.toHaveBeenCalled();
  });

  it("shouldStreamCompleteOutputWhenVerbose", async () => {
    await report("x".repeat(20_000), ["--verbose"]);

    expect(execute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ stdio: "inherit" }));
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("shouldPreserveMachineReadableOutput", async () => {
    const output = JSON.stringify({ message: "x".repeat(20_000) });
    expect((await report(output, ["--json"])).lines).toEqual([output]);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("shouldPreserveJsonProducedByTheUnderlyingTool", async () => {
    const output = JSON.stringify({ diagnostics: ["x".repeat(20_000)] });
    const { lines } = await report(output);

    expect(lines).toHaveLength(1);
    expect(lines[0] === output).toBe(true);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("shouldRetainDiagnosticsWhenTheLogCannotBeWritten", async () => {
    vi.mocked(mkdtemp).mockRejectedValueOnce(new Error("disk full"));
    const output = "x".repeat(20_000);

    expect((await report(output)).lines).toEqual([output]);
  });

  it("shouldKeepUnicodeCharactersIntactAtExcerptBoundaries", async () => {
    const displayed = (await report("😀".repeat(10_000))).lines.join("\n");

    expect(Buffer.from(displayed, "utf8").toString("utf8") === displayed).toBe(true);
  });

  it("shouldKeepParallelFailureHeadingsWithTheirOutput", async () => {
    const lines: string[] = [];
    const context = createContext({ isImplicit: false, targets: [], unownedPaths: [] });
    context.reporter = createReporter({ useColor: false, write: (line) => lines.push(line) });
    const outcome = { didTimeOut: false, durationMs: 1, exitCode: 1, isSuccess: false };
    vi.mocked(execute)
      .mockResolvedValueOnce({ ...outcome, output: `FIRST${"x".repeat(20_000)}` })
      .mockResolvedValueOnce({ ...outcome, output: "SECOND" });
    let releaseLog: () => void = () => {};
    vi.mocked(writeFile).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseLog = resolve;
        }),
    );

    const batch = runPackageBatch(
      context,
      "test",
      [error, kbd].map((workspacePackage) => ({
        workspacePackage,
        spec: { args: [], command: "test", cwd: workspacePackage.directory },
      })),
      {
        bails: false,
        concurrency: 2,
        respectsDependencies: false,
        showsPassing: false,
        streams: false,
      },
    );
    await vi.waitFor(() => expect(lines).toContain("SECOND"));
    releaseLog();
    await batch;

    expect(lines[lines.findIndex((line) => line.startsWith("FIRST")) - 1]).toBe("▸ error › test");
    expect(lines[lines.indexOf("SECOND") - 1]).toBe("▸ kbd › test");
  });
});
