import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
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

  it("should reject a bound that is not a Date as a TypeError when the validator is created", () => {
    expect(() => date({ min: "2026-01-01" as unknown as Date })).toThrow(
      new TypeError("Minimum date must be a Date, received string"),
    );
    expect(() => date({ max: {} as Date })).toThrow(new TypeError("Maximum date must be a Date, received object"));
  });

  it("should reject an invalid bound when the validator is created", () => {
    expect(() => date({ min: new Date("nope") })).toThrow(RangeError);
    expect(() => date({ max: new Date("nope") })).toThrow(RangeError);
    expect(() => date({ min: new Date("nope") })).toThrow(new RangeError("Minimum date must be a valid Date"));
    expect(() => date({ min: day("2027-01-01"), max: day("2026-01-01") })).toThrow(RangeError);
    expect(() => date({ min: day("2026-01-01"), max: day("2026-01-01") })).not.toThrow();
  });

  it("should run no check while one of its own constraints fails", () => {
    let calls = 0;
    const counted = check<Date>(() => {
      calls += 1;
      return false;
    });
    expect(codesOf(date({ min: day("2026-01-01") }, counted)(day("2025-01-01")))).toEqual(["too_small"]);
    expect(calls).toBe(0);
  });
});

describe("date, given a Date from another realm", () => {
  it("should accept a valid one, as it is, against its bounds, and reject an invalid one", () => {
    const foreign = runInNewContext("new Date('2026-06-01T00:00:00Z')") as Date;
    expect(valueOf(date({ min: day("2026-01-01") })(foreign))).toBe(foreign);
    expect(codesOf(date({ max: day("2026-01-01") })(foreign))).toEqual(["too_big"]);
    expect(codesOf(date()(runInNewContext("new Date(NaN)")))).toEqual(["invalid_type"]);
  });
});
