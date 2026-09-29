import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { coerceBigint } from "./coerce-bigint";

describe("coerceBigint", () => {
  const validator = coerceBigint();

  it("should convert bigints, safe integers and integer strings", () => {
    expect([5n, 5, "5", " -7 ", "+3", "12345678901234567890"].map((input) => valueOf(validator(input)))).toEqual([
      5n,
      5n,
      5n,
      -7n,
      3n,
      12345678901234567890n,
    ]);
  });

  it("should reject fractions, unsafe numbers, other text and other types", () => {
    expect(accepts(validator, 1.5, 2 ** 60, "1.5", "", "x", "1e3", null, true, Number.NaN)).toEqual(
      Array(9).fill(false),
    );
    expect(issuesOf(validator("x"))[0]?.params).toEqual({ expected: "bigint", received: "string", coerced: true });
  });

  it("should apply the bounds of bigint to the converted value", () => {
    expect(codesOf(coerceBigint({ min: 10n })("5"))).toEqual(["too_small"]);
    expect(coerceBigint({ gt: 0n })(1).ok).toBe(true);
  });
});
