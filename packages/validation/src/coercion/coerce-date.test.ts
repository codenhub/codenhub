import { runInNewContext } from "node:vm";

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

  it("should refuse a date-time without a zone, which names no moment, as a failed conversion", () => {
    for (const text of ["2026-09-28T14:30", "2026-09-28T14:30:00", "2026-09-28 14:30:00.5"]) {
      expect(issuesOf(validator(text))[0]?.params).toEqual({
        expected: "valid date",
        received: "string",
        coerced: true,
      });
    }
  });

  it("should read a date-time without a zone as UTC when told to, whatever the machine's timezone", () => {
    const utc = coerceDate({ zoneless: "utc" });
    expect(valueOf(utc("2026-09-28T14:30")).toISOString()).toBe("2026-09-28T14:30:00.000Z");
    expect(valueOf(utc("2026-09-28 14:30:00.5")).toISOString()).toBe("2026-09-28T14:30:00.500Z");
    expect(valueOf(utc("2026-09-28T14:30+02:00")).toISOString()).toBe("2026-09-28T12:30:00.000Z");
  });

  it("should reject a zoneless option other than utc when created", () => {
    expect(() => coerceDate({ zoneless: "local" as never })).toThrow(
      new TypeError('zoneless must be "utc", received string'),
    );
  });

  it("should read the offset forms ISO 8601 allows", () => {
    for (const text of ["2026-09-28T02:00:00+02", "2026-09-28T02:00:00+0200", "2026-09-28T02:00:00+02:00"]) {
      expect(valueOf(validator(text)).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    }
  });

  it("should reject a time or offset that does not exist as a failed conversion", () => {
    for (const text of [
      "2026-09-28T25:00:00Z",
      "2026-09-28T14:60:00Z",
      "2026-09-28T14:30:60Z",
      "2026-09-28T14:30:00+99:99",
    ]) {
      expect(issuesOf(validator(text))[0]?.params).toEqual({
        expected: "valid date",
        received: "string",
        coerced: true,
      });
    }
  });

  it("should accept the years 0 to 99", () => {
    expect(valueOf(validator("0050-06-15")).getUTCFullYear()).toBe(50);
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
    // A timestamp past the range a Date can hold is a number that could not be converted.
    expect(issuesOf(validator(9e15))[0]?.params).toEqual({ expected: "valid date", received: "number", coerced: true });
  });

  it("should apply the bounds of date to the converted value", () => {
    expect(codesOf(coerceDate({ min: new Date("2026-01-01") })("2025-01-01"))).toEqual(["too_small"]);
    expect(() => coerceDate({ min: new Date("nope") })).toThrow(RangeError);
    expect(() => coerceDate({ min: 0 as unknown as Date })).toThrow(TypeError);
  });

  it("should accept whole timestamps only, since a Date would cut a fraction of a millisecond", () => {
    expect(accepts(validator, 1, -1, 1.5, 0.9)).toEqual([true, true, false, false]);
  });

  it("should cut a fraction of a second to milliseconds the same way on every runtime", () => {
    expect(valueOf(validator("2026-09-28T14:30:00.123456789Z")).toISOString()).toBe("2026-09-28T14:30:00.123Z");
    expect(valueOf(validator("2026-09-28T14:30:00.999999Z")).toISOString()).toBe("2026-09-28T14:30:00.999Z");
    expect(valueOf(validator("2026-09-28T14:30:00.05Z")).toISOString()).toBe("2026-09-28T14:30:00.050Z");
    expect(valueOf(validator("2026-09-28T14:30:00.1234567890123456789012345Z")).toISOString()).toBe(
      "2026-09-28T14:30:00.123Z",
    );
  });
});

describe("coerceDate, given a Date from another realm", () => {
  it("should take a valid one as it is, and reject an invalid one", () => {
    const foreign = runInNewContext("new Date('2026-06-01T00:00:00Z')") as Date;
    expect(valueOf(coerceDate()(foreign))).toBe(foreign);
    expect(codesOf(coerceDate()(runInNewContext("new Date(NaN)")))).toEqual(["invalid_type"]);
  });
});
