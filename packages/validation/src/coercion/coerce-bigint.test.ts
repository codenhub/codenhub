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

  it("should refuse text with more digits than a bound allows before converting it, with the bound's issue", () => {
    const bounded = coerceBigint({ min: -10n, max: 10n });
    const start = performance.now();
    // Converting 8,000,000 digits took about 1.5 s before the bounds ran.
    expect(issuesOf(bounded("7".repeat(8_000_000)))).toEqual(issuesOf(bounded("11")));
    expect(issuesOf(bounded(`-${"7".repeat(8_000_000)}`))).toEqual(issuesOf(bounded("-11")));
    expect(issuesOf(coerceBigint({ lt: 100n })(` +${"9".repeat(8_000_000)} `))).toEqual(
      issuesOf(coerceBigint({ lt: 100n })("100")),
    );
    expect(performance.now() - start).toBeLessThan(250);
  });

  it("should count digits after the sign and leading zeros against a bound", () => {
    const bounded = coerceBigint({ min: -99n, max: 99n });
    expect(["0099", "-00099", "000", "+0", "-0"].map((input) => valueOf(bounded(input)))).toEqual([
      99n,
      -99n,
      0n,
      0n,
      0n,
    ]);
    expect(codesOf(bounded("00100"))).toEqual(["too_big"]);
    expect(codesOf(bounded("-100"))).toEqual(["too_small"]);
  });

  it("should still convert long text on the side no bound limits", () => {
    const digits = "9".repeat(30);
    expect(valueOf(coerceBigint({ max: 10n })(`-${digits}`))).toBe(-BigInt(digits));
    expect(valueOf(coerceBigint({ min: 10n })(digits))).toBe(BigInt(digits));
  });

  it("should refuse long text by the bounds it checks with, read once from the options", () => {
    let reads = 0;
    const changing = coerceBigint({
      get max() {
        reads += 1;
        return reads === 1 ? 100n : 0n;
      },
    });
    expect(issuesOf(changing("999"))).toEqual([
      { code: "too_big", path: [], params: { maximum: "100", inclusive: true, type: "bigint" } },
    ]);
  });
});
