import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { coerceString } from "./coerce-string";

describe("coerceString", () => {
  it("should convert numbers, bigints and booleans, and keep strings", () => {
    expect([12, 1n, true, "a", 1.5, -0].map((input) => valueOf(coerceString()(input)))).toEqual([
      "12",
      "1",
      "true",
      "a",
      "1.5",
      "0",
    ]);
  });

  it("should reject null, undefined, objects, arrays, functions and symbols", () => {
    expect(accepts(coerceString(), null, undefined, {}, [], () => 1, Symbol("s"))).toEqual(Array(6).fill(false));
    expect(issuesOf(coerceString()(null))[0]?.params).toEqual({ expected: "string", received: "null", coerced: true });
  });

  it("should apply the constraints and clean-up of string to the converted text", () => {
    expect(coerceString({ min: 3 })(12).ok).toBe(false);
    expect(coerceString({ min: 2 })(12).ok).toBe(true);
    expect(valueOf(coerceString({ trim: true })(" a "))).toBe("a");
    expect(codesOf(coerceString({ max: 1 })(12))).toEqual(["too_big"]);
  });

  it("should reject bad options when the validator is created, as string does", () => {
    expect(() => coerceString({ min: -1 })).toThrow(RangeError);
    expect(() => coerceString({ lowercase: true, uppercase: true })).toThrow(TypeError);
  });
});
