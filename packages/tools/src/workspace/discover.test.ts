import { describe, expect, it } from "vitest";

import { parseCatalog, parseWorkspacePatterns } from "./discover.ts";

describe("parseWorkspacePatterns", () => {
  it("shouldReadQuotedAndUnquotedGlobs", () => {
    const manifest = ["packages:", '  - "apps/*"', "  - packages/*", "  - 'packages/plugins/**'"].join("\n");

    expect(parseWorkspacePatterns(manifest)).toEqual(["apps/*", "packages/*", "packages/plugins/**"]);
  });

  it("shouldStopAtTheNextTopLevelKey", () => {
    const manifest = ["packages:", "  - packages/*", "catalog:", "  vitest: ^4.0.0"].join("\n");

    expect(parseWorkspacePatterns(manifest)).toEqual(["packages/*"]);
  });

  it("shouldIgnoreBlankLinesAndComments", () => {
    const manifest = ["packages:", "  # workspace roots", "", "  - packages/*"].join("\n");

    expect(parseWorkspacePatterns(manifest)).toEqual(["packages/*"]);
  });

  it("shouldReadManifestsUsingWindowsLineEndings", () => {
    expect(parseWorkspacePatterns("packages:\r\n  - packages/*\r\n")).toEqual(["packages/*"]);
  });

  it("shouldRejectAManifestWithoutAPackagesKey", () => {
    expect(() => parseWorkspacePatterns("catalog:\n  vitest: ^4.0.0")).toThrow(/missing a "packages:" key/);
  });

  it("shouldRejectAnEmptyPackagesList", () => {
    expect(() => parseWorkspacePatterns("packages:\ncatalog:\n")).toThrow(/declares no globs/);
  });
});

describe("parseCatalog", () => {
  it("shouldReadQuotedAndUnquotedEntriesUntilTheNextTopLevelKey", () => {
    const manifest = [
      "packages:",
      '  - "packages/*"',
      "",
      "catalog: # shared versions",
      '  "@codenhub/error": ^0.2.1 # released',
      "  vitest: ^4.1.10",
      "",
      "allowBuilds:",
      "  esbuild: true",
    ].join("\n");

    expect([...parseCatalog(manifest)]).toEqual([
      ["@codenhub/error", "^0.2.1"],
      ["vitest", "^4.1.10"],
    ]);
  });

  it("shouldReturnAnEmptyCatalogWhenThereIsNone", () => {
    expect(parseCatalog(["packages:", "  - packages/*"].join("\n")).size).toBe(0);
  });
});
