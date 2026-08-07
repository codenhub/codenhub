import { describe, expect, it } from "vitest";

import { hasContentDrift, replaceGeneratedRegion } from "./generator.ts";

const SOURCE = [
  "# Title",
  "",
  "<!-- generated: packages start -->",
  "",
  "- old entry",
  "",
  "<!-- generated: packages end -->",
  "",
  "## Next",
].join("\n");

describe("replaceGeneratedRegion", () => {
  it("shouldReplaceOnlyTheRegionBetweenItsMarkers", () => {
    expect(replaceGeneratedRegion(SOURCE, "packages", "- new entry")).toBe(
      [
        "# Title",
        "",
        "<!-- generated: packages start -->",
        "",
        "- new entry",
        "",
        "<!-- generated: packages end -->",
        "",
        "## Next",
      ].join("\n"),
    );
  });

  it("shouldBeIdempotent", () => {
    const once = replaceGeneratedRegion(SOURCE, "packages", "- new entry");

    expect(replaceGeneratedRegion(once, "packages", "- new entry")).toBe(once);
  });

  it("shouldFailWhenTheRegionIsNotDeclared", () => {
    expect(() => replaceGeneratedRegion(SOURCE, "commands", "- new entry")).toThrow(
      'Missing "commands" generated region markers.',
    );
  });
});

describe("hasContentDrift", () => {
  it("shouldIgnoreLineEndingDifferences", () => {
    expect(hasContentDrift("a\nb\n", "a\r\nb\r\n")).toBe(false);
  });

  it("shouldReportDifferentText", () => {
    expect(hasContentDrift("a\nb\n", "a\nc\n")).toBe(true);
  });
});
