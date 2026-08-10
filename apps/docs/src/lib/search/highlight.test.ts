import { describe, expect, it } from "vitest";

import { toHighlightSegments } from "./highlight";

describe("toHighlightSegments", () => {
  it("groups adjacent matches into one run", () => {
    expect(toHighlightSegments("Tokens", [0, 1, 2])).toEqual([
      { matched: true, text: "Tok" },
      { matched: false, text: "ens" },
    ]);
  });

  it("alternates runs for a scattered match", () => {
    expect(toHighlightSegments("Tokens", [0, 3])).toEqual([
      { matched: true, text: "T" },
      { matched: false, text: "ok" },
      { matched: true, text: "e" },
      { matched: false, text: "ns" },
    ]);
  });

  it("returns the whole label unmatched when there are no positions", () => {
    expect(toHighlightSegments("Tokens", [])).toEqual([{ matched: false, text: "Tokens" }]);
  });

  it("ignores positions outside the label without dropping characters", () => {
    expect(toHighlightSegments("Tokens", [-1, 9])).toEqual([{ matched: false, text: "Tokens" }]);
  });
});
