import { describe, expect, it } from "vitest";

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
    expect(() => coerceNumber({ multipleOf: 0 })).toThrow(RangeError);
  });
});
