import { describe, expect, it } from "vitest";

import { parsePorcelainPaths } from "./changed-packages.ts";

describe("parsePorcelainPaths", () => {
  it("shouldReadModifiedAddedAndUntrackedPaths", () => {
    const output = [" M packages/error/src/index.ts", "A  packages/kbd/README.md", "?? docs/new file.md", ""].join(
      "\0",
    );

    expect(parsePorcelainPaths(output)).toEqual([
      "packages/error/src/index.ts",
      "packages/kbd/README.md",
      "docs/new file.md",
    ]);
  });

  it("shouldKeepPathsGitWouldOtherwiseQuote", () => {
    const output = ['?? packages/error/docs/"quoted".md', "?? packages/error/docs/ação.md", ""].join("\0");

    expect(parsePorcelainPaths(output)).toEqual(['packages/error/docs/"quoted".md', "packages/error/docs/ação.md"]);
  });

  it("shouldReportTheNewPathOfARenameAndSkipItsOrigin", () => {
    const output = ["R  packages/kbd/src/next.ts", "packages/error/src/previous.ts", " M README.md", ""].join("\0");

    expect(parsePorcelainPaths(output)).toEqual(["packages/kbd/src/next.ts", "README.md"]);
  });

  it("shouldReturnNothingForACleanTree", () => {
    expect(parsePorcelainPaths("")).toEqual([]);
  });
});
