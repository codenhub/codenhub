import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { accepts, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { set } from "./set";

describe("set", () => {
  const ids = set(number({ int: true }));

  it("should validate every value and return a new Set", () => {
    const input = new Set([1, 2]);
    const output = valueOf(ids(input));
    expect(output).toEqual(new Set([1, 2]));
    expect(output).not.toBe(input);
  });

  it("should reject anything that is not a Set, including arrays", () => {
    expect(accepts(ids, [1, 2], null, {}, new Map())).toEqual([false, false, false, false]);
    expect(issuesOf(ids([1]))[0]?.params).toEqual({ expected: "set", received: "array" });
  });

  it("should report a bad value at its position in iteration order", () => {
    expect(issuesOf(ids(new Set([1, "a", 3]))).map((issue) => issue.path)).toEqual([[1]]);
  });

  it("should treat min and max as inclusive and length as exact", () => {
    expect(accepts(set(number(), { min: 2 }), new Set([1]), new Set([1, 2]))).toEqual([false, true]);
    expect(accepts(set(number(), { max: 1 }), new Set([1]), new Set([1, 2]))).toEqual([true, false]);
    expect(accepts(set(number(), { length: 1 }), new Set(), new Set([1]))).toEqual([false, true]);
    expect(issuesOf(set(number(), { min: 2 })(new Set([1])))[0]?.params).toEqual({ minimum: 2, type: "set" });
  });

  it("should store values that clean-up made equal once", () => {
    const clamped = set(number({ clamp: { min: 0, max: 10 } }));
    expect(valueOf(clamped(new Set([20, 30]))).size).toBe(1);
  });

  it("should be asynchronous when the value validator is", async () => {
    const result = set(isFree)(new Set(["a", "taken"]));
    expect(isPending(result)).toBe(true);
    expect(issuesOf(await result).map((issue) => issue.path)).toEqual([[1]]);
  });
});
