import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf } from "../test-utils";
import { datetime } from "./datetime";

describe("datetime", () => {
  it("should accept ISO 8601 with Z, with or without fractional seconds", () => {
    expect(accepts(datetime(), "2026-09-28T14:30:00Z", "2026-09-28T14:30:00.123Z", "2026-09-28T14:30:00.1Z")).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("should reject days that do not exist, impossible times, dates alone and offsets", () => {
    expect(
      accepts(
        datetime(),
        "2026-02-30T00:00:00Z",
        "2026-09-28T25:00:00Z",
        "2026-09-28T14:60:00Z",
        "2026-09-28",
        "2026-09-28T14:30:00+02:00",
        "2026-09-28 14:30:00Z",
        "",
      ),
    ).toEqual(Array(7).fill(false));
  });

  it("should accept a leap day only in a leap year", () => {
    expect(accepts(datetime(), "2024-02-29T00:00:00Z", "2026-02-29T00:00:00Z")).toEqual([true, false]);
  });

  it("should accept offsets when asked", () => {
    const withOffset = datetime({ offset: true });
    expect(
      accepts(withOffset, "2026-09-28T14:30:00+02:00", "2026-09-28T14:30:00-05:30", "2026-09-28T14:30:00Z"),
    ).toEqual([true, true, true]);
    expect(withOffset("2026-09-28T14:30:00+2").ok).toBe(false);
  });

  it("should require an exact number of fractional digits with precision", () => {
    expect(
      accepts(datetime({ precision: 3 }), "2026-09-28T14:30:00.123Z", "2026-09-28T14:30:00Z", "2026-09-28T14:30:00.1Z"),
    ).toEqual([true, false, false]);
    expect(accepts(datetime({ precision: 0 }), "2026-09-28T14:30:00Z", "2026-09-28T14:30:00.1Z")).toEqual([
      true,
      false,
    ]);
  });

  it("should accept the years 0 to 99", () => {
    expect(accepts(datetime(), "0099-12-31T00:00:00Z", "0000-01-01T00:00:00Z")).toEqual([true, true]);
  });

  it("should keep an offset within a day's hours and minutes", () => {
    const withOffset = datetime({ offset: true });
    expect(
      accepts(
        withOffset,
        "2026-09-28T14:30:00+02:00",
        "2026-09-28T14:30:00-23:59",
        "2026-09-28T14:30:00+99:99",
        "2026-09-28T14:30:00-25:75",
        "2026-09-28T14:30:00+02:60",
        "2026-09-28T14:30:00+24:00",
      ),
    ).toEqual([true, true, false, false, false, false]);
  });

  it("should reject a precision that is not a non-negative integer when the validator is created", () => {
    for (const precision of [-1, 1.5, Number.NaN]) {
      expect(() => datetime({ precision })).toThrow(RangeError);
    }
  });

  it("should reject a precision beyond nanoseconds when the validator is created", () => {
    expect(() => datetime({ precision: 10 })).toThrow(RangeError);
    expect(datetime({ precision: 9 })("2026-09-28T14:30:00.123456789Z").ok).toBe(true);
  });

  it("should accept a date-time without a zone with local, as an HTML datetime-local input sends it", () => {
    const local = datetime({ local: true });
    expect(
      accepts(local, "2026-09-28T14:30", "2026-09-28T14:30:15", "2026-09-28T14:30:15.5", "2026-09-28T14:30:00Z"),
    ).toEqual([true, true, true, true]);
    expect(accepts(local, "2026-09-28T14:30+02:00", "2026-02-30T14:30", "2026-09-28T24:00", "2026-09-28T14")).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(accepts(datetime(), "2026-09-28T14:30", "2026-09-28T14:30:00")).toEqual([false, false]);
  });

  it("should combine local with offset and precision", () => {
    expect(accepts(datetime({ local: true, offset: true }), "2026-09-28T14:30", "2026-09-28T14:30+02:00")).toEqual([
      true,
      true,
    ]);
    // A precision asks for a fraction of the seconds, so the seconds are required.
    expect(accepts(datetime({ local: true, precision: 3 }), "2026-09-28T14:30:00.000", "2026-09-28T14:30")).toEqual([
      true,
      false,
    ]);
    expect(() => datetime({ local: "yes" as never })).toThrow(TypeError);
  });

  it("should report invalid_type for a non-string and invalid_format for a bad one", () => {
    expect(codesOf(datetime()(1))).toEqual(["invalid_type"]);
    expect(issuesOf(datetime()("x"))[0]?.params).toEqual({ format: "datetime" });
  });
});
