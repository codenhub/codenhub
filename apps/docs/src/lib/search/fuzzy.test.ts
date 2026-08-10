import { describe, expect, it } from "vitest";

import { matchFuzzy } from "./fuzzy";

const scoreOf = (query: string, target: string) => matchFuzzy(query, target)?.score;

describe("matchFuzzy", () => {
  it("matches a case-insensitive subsequence", () => {
    expect(matchFuzzy("ptk", "Presentation Tokens")?.positions).toEqual([0, 13, 15]);
  });

  it("rejects a query that is not a subsequence", () => {
    expect(matchFuzzy("zebra", "Presentation Tokens")).toBeUndefined();
  });

  it("treats an empty query as a scoreless match", () => {
    expect(matchFuzzy("", "Tokens")).toEqual({ positions: [], score: 0 });
  });

  it("lands on word starts rather than the first character available", () => {
    // The greedy `t` is inside "Presentation"; the intended one starts "Tokens".
    expect(matchFuzzy("pt", "Presentation Tokens")?.positions).toEqual([0, 13]);
  });

  it("finds camelCase word starts in a lowercase query", () => {
    expect(matchFuzzy("bw", "borderWidth")?.positions).toEqual([0, 6]);
  });

  it("falls back to a plain scan when preferring word starts would miss", () => {
    // Moving `b` to the word start at index 4 leaves no `a` after it.
    expect(matchFuzzy("ba", "xba b")?.positions).toEqual([1, 2]);
  });

  it("ranks a literal prefix above a scattered match", () => {
    expect(scoreOf("token", "Tokens")).toBeGreaterThan(scoreOf("token", "Theme selection and precedence") ?? 0);
  });

  it("ranks the shorter target higher when both match the same way", () => {
    expect(scoreOf("tokens", "Tokens")).toBeGreaterThan(scoreOf("tokens", "Tokens and classes") ?? 0);
  });

  it("ranks adjacent characters above the same count spread out", () => {
    expect(scoreOf("abc", "abcxx")).toBeGreaterThan(scoreOf("abc", "axbxc") ?? 0);
  });
});
