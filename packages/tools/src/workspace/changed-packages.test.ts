import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { findChangedPaths, parsePorcelainPaths } from "./changed-packages.ts";

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

describe("findChangedPaths", () => {
  // A rename between two packages changes both, so a selection by owner has to see both paths.
  it("shouldReportBothSidesOfACommittedRename", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "codenhub-changed-"));
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args], {
        cwd: root,
        encoding: "utf8",
      });
    try {
      git("init", "--quiet");
      await mkdir(resolve(root, "apps/www/public"), { recursive: true });
      await writeFile(resolve(root, "apps/www/public/banner.svg"), "<svg/>", "utf8");
      git("add", ".");
      git("commit", "--quiet", "-m", "add");
      await mkdir(resolve(root, "apps/docs/public"), { recursive: true });
      git("mv", "apps/www/public/banner.svg", "apps/docs/public/banner.svg");
      git("commit", "--quiet", "-m", "move");

      expect(await findChangedPaths(root, "HEAD~1")).toEqual([
        "apps/docs/public/banner.svg",
        "apps/www/public/banner.svg",
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
