import { describe, expect, it } from "vitest";

import { chain, collect, isThenable } from "./async";

// The thenables below are the subject of these tests, not accidents.
/* oxlint-disable unicorn/no-thenable */
describe("isThenable", () => {
  it("should recognize promises and other thenables", () => {
    expect(isThenable(Promise.resolve())).toBe(true);
    expect(isThenable({ then: () => undefined })).toBe(true);
  });

  it("should reject everything else", () => {
    expect([undefined, null, 1, "then", {}, { then: 1 }].map(isThenable)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("chain", () => {
  it("should stay synchronous for a plain value", () => {
    expect(chain(2, (value) => value * 2)).toBe(4);
  });

  it("should return a promise when the value is pending", async () => {
    const chained = chain(Promise.resolve(2), (value) => value * 2);
    expect(isThenable(chained)).toBe(true);
    expect(await chained).toBe(4);
  });
});

describe("collect", () => {
  it("should return the same items synchronously when nothing is pending", () => {
    expect(collect([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("should return a promise when any item is pending, in input order", async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 10));
    const collected = collect([slow, 2, Promise.resolve(3)]);
    expect(isThenable(collected)).toBe(true);
    expect(await collected).toEqual([1, 2, 3]);
  });

  it("should handle an empty list synchronously", () => {
    expect(collect([])).toEqual([]);
  });
});
