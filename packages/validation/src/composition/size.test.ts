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
});
