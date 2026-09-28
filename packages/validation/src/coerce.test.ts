import { describe, expect, it } from "vitest";

import { coerce, val } from ".";

describe("standalone coerce helpers", () => {
  it("coerces integer strings and rejects unsafe integers", () => {
    expect(coerce.int(" +42 ")).toEqual({ ok: true, value: 42 });
    expect(coerce.int("9007199254740992", { path: ["id"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "9007199254740992" to integer',
        path: ["id"],
        expected: "safe integer string",
        received: "9007199254740992",
      },
    });
  });

  it("coerces decimal number strings and rejects exponent notation", () => {
    expect(coerce.number(".5")).toEqual({ ok: true, value: 0.5 });
    expect(coerce.number("1e3", { path: ["amount"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "1e3" to number',
        path: ["amount"],
        expected: "number string",
        received: "1e3",
      },
    });
  });

  it("coerces supported boolean strings", () => {
    expect(coerce.bool(true)).toEqual({ ok: true, value: true });
    expect(coerce.bool("on")).toEqual({ ok: true, value: true });
    expect(coerce.bool("off")).toEqual({ ok: true, value: false });
    expect(coerce.bool("maybe", { path: ["enabled"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "maybe" to boolean',
        path: ["enabled"],
        expected: "boolean string",
        received: "maybe",
      },
    });
  });

  it("coerces strings only from defined primitive values", () => {
    expect(coerce.string(123)).toEqual({ ok: true, value: "123" });
    expect(coerce.string(null, { path: ["name"] })).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Cannot coerce null or undefined to string",
        path: ["name"],
        expected: "defined primitive",
        received: "null",
      },
    });
    expect(coerce.string({ value: "name" })).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Cannot convert value to string",
        path: [],
        expected: "primitive",
        received: "object",
      },
    });
  });

  it("coerces dates from Date, timestamp, and ISO strings", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(coerce.date(now)).toEqual({ ok: true, value: now });
    expect(coerce.date(now.getTime())).toEqual({ ok: true, value: now });
    expect(coerce.date("2026-01-01")).toEqual({ ok: true, value: new Date("2026-01-01") });
    expect(coerce.date("Jan 1, 2026")).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "Jan 1, 2026" to Date',
        path: [],
        expected: "valid date string",
        received: "Jan 1, 2026",
      },
    });

    expect(coerce.date("not-a-date")).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "not-a-date" to Date',
        path: [],
        expected: "valid date string",
        received: "not-a-date",
      },
    });

    expect(coerce.date("")).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: "Cannot coerce empty string to Date",
        path: [],
        expected: "non-empty date string",
        received: '""',
      },
    });
  });
});

describe("val.coerce chainable schema validators", () => {
  it("coerces and validates strings with chained StringValidator methods", () => {
    const schema = val.coerce.string().trim().email();
    expect(schema.validate("   user@example.com   ")).toEqual({
      ok: true,
      value: "user@example.com",
    });

    const numCoerced = val.coerce.string().minLength(3);
    expect(numCoerced.validate(12345)).toEqual({ ok: true, value: "12345" });
    expect(numCoerced.validate(12).ok).toBe(false);

    expect(val.coerce.string().validate(null)).toMatchObject({ ok: false });
  });

  it("coerces and validates numbers with chained NumberValidator methods", () => {
    const schema = val.coerce.number().min(5).max(10);
    expect(schema.validate("7")).toEqual({ ok: true, value: 7 });
    expect(schema.validate("10")).toEqual({ ok: true, value: 10 });

    const tooSmall = schema.validate("3");
    expect(tooSmall).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Must be at least 5",
        path: [],
        expected: "at least 5",
        received: "3",
      },
    });

    expect(schema.validate("abc")).toMatchObject({
      ok: false,
      error: { code: "invalid_format" },
    });
  });

  it("coerces numbers and clamps them with clamp()", () => {
    const schema = val.coerce.number().clamp(0, 10);
    expect(schema.validate("15")).toEqual({ ok: true, value: 10 });
    expect(schema.validate("-5")).toEqual({ ok: true, value: 0 });
    expect(schema.validate("7")).toEqual({ ok: true, value: 7 });
  });

  it("coerces integers with val.coerce.int() and chains constraints", () => {
    const schema = val.coerce.int().min(1).max(10);
    expect(schema.validate("5")).toEqual({ ok: true, value: 5 });
    expect(schema.validate("10")).toEqual({ ok: true, value: 10 });

    // Non-integer strings fail coercion
    expect(schema.validate("3.14")).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: 'Cannot coerce "3.14" to integer',
        path: [],
        expected: "integer string",
        received: "3.14",
      },
    });

    expect(schema.validate("0")).toMatchObject({
      ok: false,
      error: { code: "too_small" },
    });
  });

  it("coerces booleans with val.coerce.bool() and val.coerce.boolean()", () => {
    const boolTrue = val.coerce.bool().true();
    expect(boolTrue.validate("yes")).toEqual({ ok: true, value: true });
    expect(boolTrue.validate("on")).toEqual({ ok: true, value: true });
    expect(boolTrue.validate("1")).toEqual({ ok: true, value: true });
    expect(boolTrue.validate("off").ok).toBe(false);

    const booleanFalse = val.coerce.boolean().false();
    expect(booleanFalse.validate("no")).toEqual({ ok: true, value: false });
    expect(booleanFalse.validate("0")).toEqual({ ok: true, value: false });
    expect(booleanFalse.validate("off")).toEqual({ ok: true, value: false });
    expect(booleanFalse.validate("yes").ok).toBe(false);
  });

  it("coerces dates with val.coerce.date() and chains constraints", () => {
    const minBound = new Date("2025-01-01T00:00:00.000Z");
    const schema = val.coerce.date().min(minBound);

    const validResult = schema.validate("2026-06-01T00:00:00.000Z");
    expect(validResult.ok).toBe(true);
    expect((validResult as { value: Date }).value).toEqual(new Date("2026-06-01T00:00:00.000Z"));

    const tooEarly = schema.validate("2024-01-01T00:00:00.000Z");
    expect(tooEarly.ok).toBe(false);
    expect(tooEarly).toMatchObject({
      error: { code: "too_small" },
    });

    expect(schema.validate("invalid-date-string").ok).toBe(false);
  });

  it("maintains immutability when chaining coerced validators", () => {
    const base = val.coerce.number();
    const minOnly = base.min(5);
    const clamped = base.clamp(0, 10);

    expect(base.validate("100")).toEqual({ ok: true, value: 100 });
    expect(minOnly.validate("100")).toEqual({ ok: true, value: 100 });
    expect(minOnly.validate("2").ok).toBe(false);
    expect(clamped.validate("100")).toEqual({ ok: true, value: 10 });
  });
});
