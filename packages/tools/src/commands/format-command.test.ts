import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { Selection } from "../workspace/select-packages.ts";
import type { CommandContext } from "./definition.ts";
import { createFormatCommand, resolveMarkdownTargets } from "./format-command.ts";

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

function createContext(selection: Selection, argv: readonly string[], lines: string[]): CommandContext {
  return {
    options: parseArguments(["format", ...argv]).options,
    passthrough: [],
    reporter: createReporter({
      useColor: false,
      write: (line) => lines.push(line),
      writeError: (line) => lines.push(line),
    }),
    selection,
    tokens: [],
    workspace: { packages: [error], root: "/repo" },
  };
}

describe("resolveMarkdownTargets", () => {
  it("shouldCollapseTheWholeRepositoryToOneRecursiveGlob", () => {
    expect(resolveMarkdownTargets(["."])).toEqual(["**/*.md"]);
  });

  it("shouldTurnADirectoryIntoItsMarkdownSubtree", () => {
    expect(resolveMarkdownTargets(["packages/error", "docs"])).toEqual(["packages/error/**/*.md", "docs/**/*.md"]);
  });

  it("shouldKeepAMarkdownFileAsTyped", () => {
    expect(resolveMarkdownTargets(["docs/tooling.md"])).toEqual(["docs/tooling.md"]);
  });

  it("shouldDropAFileThatIsNotMarkdown", () => {
    expect(resolveMarkdownTargets(["packages/error/src/index.ts", "notes.txt"])).toEqual([]);
  });

  it("shouldStripATrailingSlashAndDeDuplicate", () => {
    expect(resolveMarkdownTargets(["docs/", "docs", "docs/index.md"])).toEqual(["docs/**/*.md", "docs/index.md"]);
  });
});

describe("createFormatCommand", () => {
  const implicit: Selection = { isImplicit: true, targets: [{ package: error, paths: [] }], unownedPaths: [] };

  it("shouldCheckWithBothFormattersByDefault", async () => {
    const lines: string[] = [];
    const context = createContext(implicit, ["--dry-run"], lines);

    await expect(createFormatCommand().run(context)).resolves.toBe(0);

    const output = lines.join("\n");
    expect(output).toContain("oxfmt --check --no-error-on-unmatched-pattern .");
    expect(output).toContain("prettier --check --no-error-on-unmatched-pattern --log-level warn **/*.md");
  });

  it("shouldWriteWithBothFormattersUnderFix", async () => {
    const lines: string[] = [];
    const context = createContext(implicit, ["--fix", "--dry-run"], lines);

    await expect(createFormatCommand().run(context)).resolves.toBe(0);

    const output = lines.join("\n");
    expect(output).toContain("oxfmt --no-error-on-unmatched-pattern .");
    expect(output).not.toContain("oxfmt --check");
    expect(output).toContain("prettier --write --no-error-on-unmatched-pattern --log-level warn **/*.md");
  });

  it("shouldRunOxfmtAloneWhenTheSelectionHoldsNoMarkdown", async () => {
    const lines: string[] = [];
    const selection: Selection = {
      isImplicit: false,
      targets: [{ package: error, paths: ["src/index.ts"] }],
      unownedPaths: [],
    };
    const context = createContext(selection, ["--dry-run"], lines);

    await expect(createFormatCommand().run(context)).resolves.toBe(0);

    const output = lines.join("\n");
    expect(output).toContain("oxfmt --check --no-error-on-unmatched-pattern packages/error/src/index.ts");
    expect(output).not.toContain("prettier");
  });
});
