import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { accepts, codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { tuple } from "./tuple";

describe("tuple", () => {
  const point = tuple([number(), number()]);

  it("should validate each position with its own validator", () => {
    expect(valueOf(tuple([string(), number()])(["a", 1]))).toEqual(["a", 1]);
    expect(issuesOf(tuple([string(), number()])([1, "a"])).map((issue) => issue.path)).toEqual([[0], [1]]);
  });

  it("should reject non-arrays", () => {
    expect(accepts(point, null, {}, "12", new Set())).toEqual(Array(4).fill(false));
    expect(issuesOf(point("12"))[0]?.params).toEqual({ expected: "array", received: "string" });
  });

  it("should require exactly the tuple's length without a rest, reporting which side failed", () => {
    expect(issuesOf(point([1]))[0]).toEqual({
      code: "too_small",
      path: [],
      params: { minimum: 2, type: "array", exact: true },
    });
    expect(issuesOf(point([1, 2, 3]))[0]).toEqual({
      code: "too_big",
      path: [],
      params: { maximum: 2, type: "array", exact: true },
    });
  });

  it("should report a wrong length without validating the items", () => {
    expect(codesOf(point(["a"]))).toEqual(["too_small"]);
  });

  describe("rest", () => {
    const args = tuple([string()], { rest: number() });

    it("should accept the fixed items followed by any number of rest items", () => {
      expect(accepts(args, ["a"], ["a", 1], ["a", 1, 2, 3])).toEqual([true, true, true]);
    });

    it("should validate the rest items at their own indexes", () => {
      expect(issuesOf(args(["a", 1, "x", 3, "y"])).map((issue) => issue.path)).toEqual([[2], [4]]);
    });

    it("should still require the fixed items", () => {
      expect(issuesOf(args([]))[0]).toEqual({ code: "too_small", path: [], params: { minimum: 1, type: "array" } });
    });
  });

  it("should treat sparse array holes as undefined instead of skipping them", () => {
    const sparse: unknown[] = [1];
    sparse.length = 2;
    expect(tuple([number(), number()])(sparse).ok).toBe(false);
  });

  it("should give a tuple type", () => {
    const pair: [string, number] = valueOf(tuple([string(), number()])(["a", 1]));
    expect(pair).toEqual(["a", 1]);
    const withRest: [string, ...number[]] = valueOf(tuple([string()], { rest: number() })(["a", 1, 2]));
    expect(withRest).toEqual(["a", 1, 2]);
  });

  it("should be asynchronous when any position is", async () => {
    const result = tuple([string(), isFree])(["a", "taken"]);
    expect(isPending(result)).toBe(true);
    expect(issuesOf(await result).map((issue) => issue.path)).toEqual([[1]]);
    expect(isPending(point([1, 2]))).toBe(false);
  });
});
