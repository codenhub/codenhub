import { describe, expect, it } from "vitest";

import { assertSizeOptions, sizeIssues } from "./size";

describe("assertSizeOptions", () => {
  it("should accept non-negative integers and nothing", () => {
    expect(() => assertSizeOptions({})).not.toThrow();
    expect(() => assertSizeOptions({ min: 0, max: 3, length: 2 })).not.toThrow();
  });

  it.each([
    { min: -1 },
    { max: 1.5 },
    { length: Number.NaN },
    { min: 3, max: 2 },
    { min: 3, length: 2 },
    { max: 2, length: 3 },
  ])("should throw a RangeError for %o", (options) => {
    expect(() => assertSizeOptions(options)).toThrow(RangeError);
  });

  it("should name the size in each message about a limit", () => {
    expect(() => assertSizeOptions({ min: "1" as never })).toThrow(
      new TypeError("Minimum size must be a number, received string"),
    );
    expect(() => assertSizeOptions({ max: -1 })).toThrow(
      new RangeError("Maximum size must be a non-negative integer, received -1"),
    );
    expect(() => assertSizeOptions({ length: 0.5 })).toThrow(
      new RangeError("Size must be a non-negative integer, received 0.5"),
    );
    expect(() => assertSizeOptions({ length: 3, max: 2 })).toThrow(
      new RangeError("No value can satisfy length 3 and max 2"),
    );
  });
});

describe("sizeIssues", () => {
  it("should be empty when every constraint holds", () => {
    expect(sizeIssues(2, "array", { min: 1, max: 3, length: 2 })).toEqual([]);
  });

  it("should treat min and max as inclusive and carry the limit and type in params", () => {
    expect(sizeIssues(1, "set", { min: 2 })).toEqual([
      { code: "too_small", path: [], params: { minimum: 2, type: "set" } },
    ]);
    expect(sizeIssues(4, "map", { max: 3 })).toEqual([
      { code: "too_big", path: [], params: { maximum: 3, type: "map" } },
    ]);
    expect(sizeIssues(2, "array", { min: 2, max: 2 })).toEqual([]);
  });

  it("should mark an exact length and report which side failed", () => {
    expect(sizeIssues(1, "array", { length: 2 })[0]).toEqual({
      code: "too_small",
      path: [],
      params: { minimum: 2, exact: true, type: "array" },
    });
    expect(sizeIssues(3, "array", { length: 2 })[0]?.code).toBe("too_big");
  });

  it("should build each issue with its code, path and params in that order, and params in theirs", () => {
    const issues = [...sizeIssues(2, "set", { min: 3, max: 1 }), ...sizeIssues(3, "map", { length: 2 })];
    expect(issues.map((issue) => [Object.keys(issue), Object.keys(issue.params ?? {})])).toEqual([
      [
        ["code", "path", "params"],
        ["minimum", "type"],
      ],
      [
        ["code", "path", "params"],
        ["maximum", "type"],
      ],
      [
        ["code", "path", "params"],
        ["maximum", "exact", "type"],
      ],
    ]);
  });

  it("should give a new list on each call", () => {
    const options = { min: 3 };
    const first = sizeIssues(1, "array", options);
    expect(sizeIssues(1, "array", options)).not.toBe(first);
    expect(sizeIssues(5, "array", options)).toEqual([]);
  });
});
