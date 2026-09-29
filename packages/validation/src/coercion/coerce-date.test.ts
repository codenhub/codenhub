import { describe, expect, it } from "vitest";

import { accepts, codesOf, issuesOf, valueOf } from "../test-utils";
import { coerceDate } from "./coerce-date";

describe("coerceDate", () => {
  const validator = coerceDate();

  it("should convert dates, timestamps and ISO 8601 strings", () => {
    const date = new Date("2026-09-28T00:00:00Z");
    expect(valueOf(validator(date))).toBe(date);
    expect(valueOf(validator(0)).getTime()).toBe(0);
    expect(valueOf(validator("2026-09-28T00:00:00Z")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(valueOf(validator("2026-09-28")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(valueOf(validator("2026-09-28T02:00:00+02:00")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(valueOf(validator(" 2026-09-28 ")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("should reject free-form strings, an invalid Date, non-finite timestamps and other types", () => {
    expect(
      accepts(validator, "yesterday", "", "09/28/2026", new Date("x"), Infinity, Number.NaN, null, {}, true),
    ).toEqual(Array(9).fill(false));
  });

  it("should reject a date that does not exist", () => {
    expect(accepts(validator, "2026-13-45", "2026-02-30", "2026-04-31T00:00:00Z", "2026-00-10")).toEqual(
      Array(4).fill(false),
    );
  });

  it("should say what could not be converted", () => {
    expect(issuesOf(validator("yesterday"))[0]?.params).toEqual({
      expected: "valid date",
      received: "string",
      coerced: true,
    });
  });

  it("should apply the bounds of date to the converted value", () => {
    expect(codesOf(coerceDate({ min: new Date("2026-01-01") })("2025-01-01"))).toEqual(["too_small"]);
    expect(() => coerceDate({ min: new Date("nope") })).toThrow(RangeError);
  });
});
