import { describe, expect, it } from "vitest";

import { nonZero } from "../checks/non-zero";
import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { coerceNumber } from "./coerce-number";

describe("coerceNumber", () => {
  const validator = coerceNumber();

  it("should convert numbers and decimal strings", () => {
    expect(["42", " 3.5 ", "-1", "+2", ".5", "5.", 7].map((input) => valueOf(validator(input)))).toEqual([
      42, 3.5, -1, 2, 0.5, 5, 7,
    ]);
  });

  it("should reject empty and non-numeric strings, hex, exponents, separators and non-finite numbers", () => {
    expect(
      accepts(validator, "", "  ", "abc", "1e3", "0x10", "1,5", "Infinity", "NaN", Infinity, Number.NaN, "1 2"),
    ).toEqual(Array(11).fill(false));
  });

  it("should reject text holding a whole number too large to read exactly, as coerceBigint does", () => {
    expect(codesOf(validator("12345678901234567890"))).toEqual(["invalid_type"]);
    expect(issuesOf(validator("-9007199254740993"))[0]?.params).toEqual({
      expected: "number",
      received: "string",
      coerced: true,
    });
    expect(valueOf(validator("9007199254740991"))).toBe(Number.MAX_SAFE_INTEGER);
    expect(valueOf(validator(1e20))).toBe(1e20);
  });

  it("should reject a long run of digits that does not end as a number in linear time", () => {
    // A pattern with two adjacent digit runs backtracks quadratically: this took seconds before.
    const start = performance.now();
    expect(validator(`${"1".repeat(100_000)}x`).ok).toBe(false);
    expect(performance.now() - start).toBeLessThan(250);
  });

  it("should reject booleans, null, objects and arrays instead of guessing", () => {
    expect(accepts(validator, true, null, undefined, {}, [5], new Date(), 5n)).toEqual(Array(7).fill(false));
  });

  it("should say what could not be converted, without echoing the input", () => {
    const [issue] = issuesOf(validator("abc"));
    expect(issue).toEqual({
      code: "invalid_type",
      path: [],
      params: { expected: "number", received: "string", coerced: true },
    });
    expect(JSON.stringify(issue)).not.toContain("abc");
  });

  it("should apply the constraints of number to the converted value", () => {
    const port = coerceNumber({ int: true, min: 1, max: 65535 });
    expect(valueOf(port("8080"))).toBe(8080);
    expect(codesOf(port("0"))).toEqual(["too_small"]);
    expect(codesOf(port("1.5"))).toEqual(["invalid_value"]);
    expect(valueOf(coerceNumber({ clamp: { min: 0, max: 10 } })("99"))).toBe(10);
  });

  it("should reject bad options when the validator is created, as number does", () => {
    expect(() => coerceNumber({ min: Number.NaN })).toThrow(RangeError);
  });

  it("should read minus zero as zero", () => {
    expect(Object.is(valueOf(coerceNumber()("-0")), 0)).toBe(true);
    expect(coerceNumber(nonZero())("-0").ok).toBe(false);
  });

  it("should keep every zero written as zero, and pass the number -0 through as number does", () => {
    expect(accepts(coerceNumber(), "0", "0.000", "-0.0", ".0", "0.")).toEqual(Array(5).fill(true));
    expect(Object.is(valueOf(coerceNumber()(-0)), -0)).toBe(true);
  });

  it("should reject a nonzero decimal too small for a double, which would be read as 0", () => {
    expect(accepts(coerceNumber(), `0.${"0".repeat(400)}1`, `-0.${"0".repeat(400)}1`)).toEqual([false, false]);
    expect(valueOf(coerceNumber()(`0.${"0".repeat(300)}1`))).toBe(1e-301);
  });
});
