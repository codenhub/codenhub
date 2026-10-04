import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { multipleOf } from "../checks/multiple-of";
import { nonZero } from "../checks/non-zero";
import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { number } from "./number";

describe("number", () => {
  it("should accept finite numbers, including zero and negatives", () => {
    expect(accepts(number(), 0, -0, 1.5, -3, Number.MAX_VALUE)).toEqual(Array(5).fill(true));
  });

  it("should reject NaN, the infinities and every other type, naming what was received", () => {
    expect(accepts(number(), Number.NaN, Infinity, -Infinity, "1", null, undefined, 1n, [])).toEqual(
      Array(8).fill(false),
    );
    expect(issuesOf(number()(Number.NaN))[0]?.params).toEqual({ expected: "number", received: "nan" });
    expect(issuesOf(number()(Infinity))[0]?.params).toEqual({ expected: "number", received: "infinity" });
  });

  describe("bounds", () => {
    it("should treat min and max as inclusive and gt and lt as exclusive", () => {
      expect(accepts(number({ min: 1 }), 0, 1, 2)).toEqual([false, true, true]);
      expect(accepts(number({ max: 1 }), 0, 1, 2)).toEqual([true, true, false]);
      expect(accepts(number({ gt: 1 }), 0, 1, 2)).toEqual([false, false, true]);
      expect(accepts(number({ lt: 1 }), 0, 1, 2)).toEqual([true, false, false]);
    });

    it("should say in params which bound failed and whether it is inclusive", () => {
      expect(issuesOf(number({ min: 1 })(0))[0]).toEqual({
        code: "too_small",
        path: [],
        params: { minimum: 1, inclusive: true, type: "number" },
      });
      expect(issuesOf(number({ lt: 1 })(1))[0]).toEqual({
        code: "too_big",
        path: [],
        params: { maximum: 1, inclusive: false, type: "number" },
      });
    });

    it("should express positive, negative and their non- variants with the bounds", () => {
      expect(accepts(number({ gt: 0 }), -1, 0, 1)).toEqual([false, false, true]);
      expect(accepts(number({ min: 0 }), -1, 0, 1)).toEqual([false, true, true]);
      expect(accepts(number({ lt: 0 }), -1, 0, 1)).toEqual([true, false, false]);
      expect(accepts(number({ max: 0 }), -1, 0, 1)).toEqual([true, true, false]);
    });
  });

  describe("integers, zero and multiples", () => {
    it("should require whole numbers with int, and exactly representable ones with safeInt", () => {
      expect(accepts(number({ int: true }), 1, 1.5, 2 ** 60)).toEqual([true, false, true]);
      expect(accepts(number({ safeInt: true }), 1, 1.5, 2 ** 60)).toEqual([true, false, false]);
      expect(issuesOf(number({ int: true })(1.5))[0]?.params).toEqual({ type: "number", format: "int" });
    });

    it("should report a fraction once when both int and safeInt are set, and an unsafe integer as safeInt", () => {
      const whole = number({ int: true, safeInt: true });
      expect(issuesOf(whole(1.5)).map((found) => found.params?.["format"])).toEqual(["int"]);
      expect(issuesOf(whole(2 ** 60)).map((found) => found.params?.["format"])).toEqual(["safeInt"]);
    });

    it("should reject zero with nonZero, negative zero included", () => {
      expect(accepts(number(nonZero()), 0, -0, 1, -1)).toEqual([false, false, true, true]);
    });

    it("should compare multipleOf as the decimals the numbers are written as", () => {
      expect(accepts(number(multipleOf(0.1)), 0.3, 0.35, 1.1, -0.7)).toEqual([true, false, true, true]);
      expect(accepts(number(multipleOf(0.3)), 0.9, 1e16, 3e14 + 0.3)).toEqual([true, false, true]);
      expect(accepts(number(multipleOf(1e-7)), 3e-7, 3.5e-7)).toEqual([true, false]);
      expect(number(multipleOf(0.5))(5e-324).ok).toBe(false);
      // A value computed in floating point is not the decimal it looks like.
      expect(number(multipleOf(0.1))(0.1 + 0.2).ok).toBe(false);
      expect(accepts(number(multipleOf(5)), 10, 0, -15, 7)).toEqual([true, true, true, false]);
      expect(issuesOf(number(multipleOf(5))(7))[0]?.params).toEqual({ type: "number", format: "multipleOf", value: 5 });
    });

    it("should check multipleOf exactly for safe integers", () => {
      expect(accepts(number(multipleOf(3)), 8e15 + 2, 9e15, 3e15 + 1)).toEqual([false, true, false]);
      expect(number(multipleOf(10))(Number.MAX_SAFE_INTEGER).ok).toBe(false);
    });

    it("should read a whole number past the safe integers as it is written, not as the double it is held as", () => {
      // 2^60 is written 1152921504606847000, which is not a multiple of 1024, though the double is.
      expect(accepts(number(multipleOf(1024)), 2 ** 60)).toEqual([false]);
    });

    it("should reject a step that is not a positive finite number when the validator is created", () => {
      for (const step of [0, -1, Number.NaN, Infinity]) {
        expect(() => multipleOf(step)).toThrow(RangeError);
      }
    });
  });

  describe("clamp", () => {
    it("should move the value into the range instead of rejecting it", () => {
      const clamped = number({ clamp: { min: 0, max: 10 } });
      expect([-5, 5, 50].map((input) => valueOf(clamped(input)))).toEqual([0, 5, 10]);
    });

    it("should read the range once, when the validator is created", () => {
      const range = { min: 0, max: 10 };
      const clamped = number({ clamp: range });
      range.max = 1;
      expect(valueOf(clamped(5))).toBe(5);
    });

    it("should run before the constraints, so they see the clamped number", () => {
      expect(number({ clamp: { min: 0, max: 10 }, max: 10 })(50).ok).toBe(true);
      expect(number({ clamp: { min: 0, max: 10 }, min: 5 })(2).ok).toBe(false);
    });

    it("should reject a range whose every value breaks a bound, when the validator is created", () => {
      for (const options of [
        { clamp: { min: 0, max: 10 }, min: 11 },
        { clamp: { min: 0, max: 10 }, gt: 10 },
        { clamp: { min: 20, max: 30 }, max: 10 },
        { clamp: { min: 20, max: 30 }, lt: 20 },
      ]) {
        expect(() => number(options)).toThrow(RangeError);
      }
      expect(() => number({ clamp: { min: 0, max: 10 }, min: 10, lt: 11 })).not.toThrow();
    });

    it("should reject a range from Infinity or to -Infinity, which would clamp every number to an infinity", () => {
      expect(() => number({ clamp: { min: Infinity, max: Infinity } })).toThrow(
        new RangeError("No finite number can satisfy clamp Infinity to Infinity"),
      );
      expect(() => number({ clamp: { min: -Infinity, max: -Infinity } })).toThrow(RangeError);
      expect(valueOf(number({ clamp: { min: -Infinity, max: Infinity } })(5))).toBe(5);
    });

    it("should still reject non-numbers", () => {
      expect(number({ clamp: { min: 0, max: 10 } })("5").ok).toBe(false);
    });

    it.each([
      [null, "null"],
      [false, "boolean"],
      [5, "number"],
      ["0-10", "string"],
      [[0, 10], "array"],
    ])("should reject %j as the range when the validator is created, naming what it received", (range, received) => {
      expect(() => number({ clamp: range as never })).toThrow(
        new TypeError(`clamp must be a range with a number min and max, received ${received}`),
      );
    });

    it("should reject a range without a number min or max, naming what it has instead", () => {
      expect(() => number({ clamp: {} as never })).toThrow(
        new TypeError("clamp.min must be a number, received undefined"),
      );
      expect(() => number({ clamp: { min: 0, max: null } as never })).toThrow(
        new TypeError("clamp.max must be a number, received null"),
      );
      expect(() => number({ clamp: { min: "0", max: 1 } as never })).toThrow(
        new TypeError("clamp.min must be a number, received string"),
      );
    });

    it("should reject NaN bounds and an inverted range when the validator is created", () => {
      expect(() => number({ clamp: { min: Number.NaN, max: 1 } })).toThrow(RangeError);
      expect(() => number({ clamp: { min: 2, max: 1 } })).toThrow(RangeError);
    });
  });

  it("should reject a NaN bound when the validator is created, instead of ignoring it", () => {
    for (const bound of ["min", "max", "gt", "lt"] as const) {
      expect(() => number({ [bound]: Number.NaN })).toThrow(RangeError);
    }
    expect(() => number({ min: -Infinity, max: Infinity })).not.toThrow();
  });

  it("should reject bounds no number can satisfy when the validator is created", () => {
    for (const options of [
      { min: 2, max: 1 },
      { gt: 1, lt: 1 },
      { min: 1, lt: 1 },
      { gt: 1, max: 1 },
    ]) {
      expect(() => number(options)).toThrow(RangeError);
    }
    expect(() => number({ min: 1, max: 1 })).not.toThrow();
    expect(() => number({ gt: 0, lt: 1 })).not.toThrow();
  });

  it("should reject an infinite bound that shuts out every finite number, and keep the ones that do not", () => {
    for (const options of [{ min: Infinity }, { gt: Infinity }, { max: -Infinity }, { lt: -Infinity }]) {
      expect(() => number(options)).toThrow(RangeError);
    }
    expect(() => number({ min: -Infinity, gt: -Infinity, max: Infinity, lt: Infinity })).not.toThrow();
  });

  it("should report every constraint that fails", () => {
    expect(codesOf(number({ min: 10, int: true }, nonZero())(0.5))).toEqual(["too_small", "invalid_value"]);
  });

  it("should run no check while one of its own constraints fails", () => {
    let calls = 0;
    const counted = check<number>(() => {
      calls += 1;
      return false;
    });
    expect(codesOf(number({ int: true }, multipleOf(0.5), counted)(1.5))).toEqual(["invalid_value"]);
    expect(codesOf(number({ max: 1 }, counted)(2))).toEqual(["too_big"]);
    expect(calls).toBe(0);
  });
});
