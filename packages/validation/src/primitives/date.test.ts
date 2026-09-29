import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { date } from "./date";

const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

describe("date", () => {
  it("should accept valid Date objects and return the same one", () => {
    const value = day("2026-09-28");
    expect(valueOf(date()(value))).toBe(value);
  });

  it("should reject an invalid Date, timestamps and date strings", () => {
    expect(accepts(date(), new Date("nope"), 1_700_000_000_000, "2026-09-28", null, {})).toEqual(Array(5).fill(false));
    expect(issuesOf(date()(new Date("nope")))[0]?.params).toEqual({ expected: "valid date", received: "invalid date" });
  });

  it("should treat min and max as inclusive", () => {
    const window = date({ min: day("2026-01-01"), max: day("2026-12-31") });
    expect(accepts(window, day("2025-12-31"), day("2026-01-01"), day("2026-12-31"), day("2027-01-01"))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it("should carry the bound in params", () => {
    expect(issuesOf(date({ min: day("2026-01-01") })(day("2025-01-01")))[0]).toEqual({
      code: "too_small",
      path: [],
      params: { minimum: day("2026-01-01"), inclusive: true, type: "date" },
    });
    expect(codesOf(date({ max: day("2026-01-01") })(day("2027-01-01")))).toEqual(["too_big"]);
  });

  it("should read its bounds once, so changing them later or through an issue has no effect", () => {
    const min = day("2026-01-01");
    const validator = date({ min });
    min.setUTCFullYear(2000);
    expect(validator(day("2025-01-01")).ok).toBe(false);
    const reported = issuesOf(validator(day("2025-01-01")))[0]?.params?.minimum as Date;
    reported.setUTCFullYear(2000);
    expect(issuesOf(validator(day("2025-01-01")))[0]?.params?.minimum).toEqual(day("2026-01-01"));
  });

  it("should reject an invalid bound when the validator is created", () => {
    expect(() => date({ min: new Date("nope") })).toThrow(RangeError);
    expect(() => date({ max: new Date("nope") })).toThrow(RangeError);
    expect(() => date({ min: day("2027-01-01"), max: day("2026-01-01") })).toThrow(RangeError);
    expect(() => date({ min: day("2026-01-01"), max: day("2026-01-01") })).not.toThrow();
  });
});
