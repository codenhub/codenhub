import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { bigint } from "./bigint";

describe("bigint", () => {
  it("should accept bigints, including zero and negatives, and return them", () => {
    expect(accepts(bigint(), 0n, -5n, 10n ** 30n)).toEqual([true, true, true]);
    expect(valueOf(bigint()(5n))).toBe(5n);
  });

  it("should reject numbers, including whole ones, and every other type", () => {
    expect(accepts(bigint(), 1, "1", null, undefined, {}, true)).toEqual(Array(6).fill(false));
    expect(issuesOf(bigint()(1))[0]?.params).toEqual({ expected: "bigint", received: "number" });
  });

  it("should treat min and max as inclusive and gt and lt as exclusive", () => {
    expect(accepts(bigint({ min: 1n }), 0n, 1n, 2n)).toEqual([false, true, true]);
    expect(accepts(bigint({ max: 1n }), 0n, 1n, 2n)).toEqual([true, true, false]);
    expect(accepts(bigint({ gt: 0n }), -1n, 0n, 1n)).toEqual([false, false, true]);
    expect(accepts(bigint({ lt: 0n }), -1n, 0n, 1n)).toEqual([true, false, false]);
  });

  it("should reject bounds no bigint can satisfy when the validator is created", () => {
    for (const options of [
      { min: 2n, max: 1n },
      { gt: 1n, lt: 1n },
      { min: 1n, lt: 1n },
      { gt: 1n, max: 1n },
    ]) {
      expect(() => bigint(options)).toThrow(RangeError);
    }
    expect(() => bigint({ min: 1n, max: 1n })).not.toThrow();
  });

  it("should reject exclusive bounds with no whole number between them", () => {
    expect(() => bigint({ gt: 1n, lt: 2n })).toThrow(RangeError);
    expect(bigint({ gt: 1n, lt: 3n })(2n).ok).toBe(true);
  });

  it("should compare beyond the safe integer range exactly", () => {
    expect(bigint({ max: 2n ** 64n })(2n ** 64n + 1n).ok).toBe(false);
  });

  it("should say in params which bound failed and whether it is inclusive", () => {
    expect(issuesOf(bigint({ gt: 0n })(0n))[0]).toEqual({
      code: "too_small",
      path: [],
      params: { minimum: "0", inclusive: false, type: "bigint" },
    });
    expect(codesOf(bigint({ max: 0n })(1n))).toEqual(["too_big"]);
  });

  it("should run no check while one of its own constraints fails", () => {
    let calls = 0;
    const counted = check<bigint>(() => {
      calls += 1;
      return false;
    });
    expect(codesOf(bigint({ min: 10n }, counted)(5n))).toEqual(["too_small"]);
    expect(calls).toBe(0);
  });

  it("should report a bound as its decimal digits, so the issue can be sent as JSON", () => {
    const result = bigint({ max: 2n ** 64n })(2n ** 64n + 1n);
    expect(issuesOf(result)[0]?.params).toEqual({ maximum: "18446744073709551616", inclusive: true, type: "bigint" });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
