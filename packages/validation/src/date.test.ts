import { describe, expect, expectTypeOf, it } from "vitest";

import { type Infer, type InferInput } from "./core";
import { date } from "./date";
import { val } from "./index";

describe("DateValidator", () => {
  it("validates Date instances and rejects non-Date input", () => {
    const schema = val.date();
    const now = new Date();

    expect(schema.validate(now)).toEqual({ ok: true, value: now });
    expect(schema.validate("2026-01-01")).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected Date, got 2026-01-01",
        path: [],
        expected: "Date",
        received: "2026-01-01",
      },
    });

    expect(schema.validate(1700000000000)).toMatchObject({ ok: false });
    expect(schema.validate(null)).toMatchObject({ ok: false });

    expect(schema.is(now)).toBe(true);
    expect(schema.is("2026-01-01")).toBe(false);
  });

  it("rejects invalid Date instances (NaN timestamp)", () => {
    const schema = date();
    const invalidDate = new Date("invalid date string");

    expect(schema.validate(invalidDate)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Invalid Date",
        path: [],
        expected: "valid Date",
        received: "Invalid Date",
      },
    });
  });

  it("enforces .min() and .max() boundaries with custom messages", () => {
    const minBound = new Date("2026-01-01T00:00:00.000Z");
    const maxBound = new Date("2026-12-31T23:59:59.999Z");

    const schema = val.date().min(minBound, "Date cannot be in the past").max(maxBound, "Date cannot exceed 2026");

    const validDate = new Date("2026-06-15T12:00:00.000Z");
    expect(schema.validate(validDate)).toEqual({ ok: true, value: validDate });

    const tooEarly = new Date("2025-12-31T23:59:59.999Z");
    expect(schema.validate(tooEarly, { path: ["createdAt"] })).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Date cannot be in the past",
        path: ["createdAt"],
        expected: `>= ${minBound.toISOString()}`,
        received: tooEarly.toISOString(),
      },
    });

    const tooLate = new Date("2027-01-01T00:00:00.000Z");
    expect(schema.validate(tooLate, { path: ["expiresAt"] })).toEqual({
      ok: false,
      error: {
        code: "too_big",
        message: "Date cannot exceed 2026",
        path: ["expiresAt"],
        expected: `<= ${maxBound.toISOString()}`,
        received: tooLate.toISOString(),
      },
    });
  });

  it("supports chaining modifiers: optional, nullable, default, refine, transform", () => {
    const defaultDate = new Date("2026-01-01T00:00:00.000Z");
    const schema = val.date().default(defaultDate);

    expect(schema.validate(undefined)).toEqual({ ok: true, value: defaultDate });

    const isoString = val.date().transform((d) => d.toISOString());
    const testDate = new Date("2026-09-28T00:00:00.000Z");
    expect(isoString.validate(testDate)).toEqual({
      ok: true,
      value: "2026-09-28T00:00:00.000Z",
    });

    type DOutput = Infer<typeof schema>;
    type DInput = InferInput<typeof schema>;
    expectTypeOf<DOutput>().toEqualTypeOf<Date>();
    expectTypeOf<DInput>().toEqualTypeOf<unknown>();
  });
});
