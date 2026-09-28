import { describe, expect, it } from "vitest";

import { type ValidationErr, val } from ".";

describe("number validator constraints", () => {
  it("validates sign-related constraints", () => {
    expect(val.number().positive().validate(1)).toEqual({ ok: true, value: 1 });
    expect(val.number().negative().validate(-1)).toEqual({ ok: true, value: -1 });
    expect(val.number().nonNegative().validate(0)).toEqual({ ok: true, value: 0 });
    expect(val.number().nonPositive().validate(0)).toEqual({ ok: true, value: 0 });
    expect(
      val
        .number()
        .nonZero()
        .validate(0, { path: ["amount"] }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must not be zero",
        path: ["amount"],
        expected: "non-zero number",
        received: "0",
      },
    });
  });

  it("validates integer constraints", () => {
    expect(val.number().int().validate(10)).toEqual({ ok: true, value: 10 });
    expect(val.number().safeInt().validate(Number.MAX_SAFE_INTEGER)).toEqual({
      ok: true,
      value: Number.MAX_SAFE_INTEGER,
    });
    expect(
      val
        .number()
        .int()
        .validate(10.5, { path: ["count"] }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must be an integer",
        path: ["count"],
        expected: "integer",
        received: "10.5",
      },
    });
  });

  it("validates finite numbers before method-specific checks", () => {
    expect(
      val
        .number()
        .positive()
        .validate(Infinity, { path: ["size"] }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must be a finite number",
        path: ["size"],
        expected: "finite number",
        received: "Infinity",
      },
    });
  });

  it("validates ranges and invalid range configuration", () => {
    expect(val.number().range({ min: 1, max: 10 }).validate(5)).toEqual({ ok: true, value: 5 });
    expect(
      val
        .number()
        .range({ min: 1 })
        .validate(0, { path: ["count"] }),
    ).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Must be at least 1",
        path: ["count"],
        expected: "at least 1",
        received: "0",
      },
    });
    expect(val.number().range({ min: 10, max: 1 }).validate(1)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Range minimum cannot be greater than maximum",
        path: [],
      },
    });
    expect(val.number().range({ min: Number.NaN }).validate(1)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Range minimum must be a finite number",
        path: [],
      },
    });
    expect(val.number().range({ max: Number.NaN }).validate(1)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Range maximum must be a finite number",
        path: [],
      },
    });
  });

  it("validates finite and port helpers", () => {
    expect(val.number().finite().validate(1)).toEqual({ ok: true, value: 1 });
    expect(val.number().port().validate(65535)).toEqual({ ok: true, value: 65535 });
    expect(
      val
        .number()
        .port()
        .validate(65536, { path: ["port"] }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must be a valid port number (1-65535)",
        path: ["port"],
        expected: "integer from 1 to 65535",
        received: "65536",
      },
    });
  });
});

describe("NumberValidator core API", () => {
  it("validates basic number type and rejects NaN and non-numbers", () => {
    const schema = val.number();
    expect(schema.validate(42)).toEqual({ ok: true, value: 42 });
    expect(schema.validate("42")).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected number, got 42",
        path: [],
        expected: "number",
        received: "42",
      },
    });
    expect(schema.validate(Number.NaN)).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected number, got NaN",
        path: [],
        expected: "number",
        received: "NaN",
      },
    });
    expect(schema.is(42)).toBe(true);
    expect(schema.is("42")).toBe(false);
  });

  it("chains gt, gte, lt, lte, min, max with custom messages", () => {
    const schema = val.number().gt(5, "Above 5").lt(10, "Under 10");
    expect(schema.validate(7)).toEqual({ ok: true, value: 7 });
    expect(schema.validate(5)).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Above 5",
        path: [],
        expected: "greater than 5",
        received: "5",
      },
    });
    expect(schema.validate(10)).toEqual({
      ok: false,
      error: {
        code: "too_big",
        message: "Under 10",
        path: [],
        expected: "less than 10",
        received: "10",
      },
    });

    const inclusiveSchema = val.number().min(0, "Non-negative").max(100, "Max 100");
    expect(inclusiveSchema.validate(0)).toEqual({ ok: true, value: 0 });
    expect(inclusiveSchema.validate(100)).toEqual({ ok: true, value: 100 });
    expect(inclusiveSchema.validate(-1)).toMatchObject({
      ok: false,
      error: { code: "too_small", message: "Non-negative" },
    });
    expect(inclusiveSchema.validate(101)).toMatchObject({
      ok: false,
      error: { code: "too_big", message: "Max 100" },
    });
  });

  it("validates multipleOf, port, and integer checks", () => {
    const stepSchema = val.number().multipleOf(5, "Multiple of 5");
    expect(stepSchema.validate(25)).toEqual({ ok: true, value: 25 });
    expect(stepSchema.validate(24)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Multiple of 5",
        path: [],
        expected: "multiple of 5",
        received: "24",
      },
    });

    const portSchema = val.number().port("Invalid port");
    expect(portSchema.validate(3000)).toEqual({ ok: true, value: 3000 });
    expect(portSchema.validate(70000)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Invalid port",
        path: [],
        expected: "integer from 1 to 65535",
        received: "70000",
      },
    });
  });

  it("accumulates multiple issues when abortEarly is false", () => {
    const schema = val.number().positive("Must be > 0").int("Must be integer");
    const result = schema.validate(-3.5, { abortEarly: false });

    expect(result.ok).toBe(false);
    const error = (result as ValidationErr).error;
    expect(error.issues).toHaveLength(2);
    expect(error.issues?.[0].message).toBe("Must be > 0");
    expect(error.issues?.[1].message).toBe("Must be integer");
  });

  it("supports chaining modifiers optional, default, refine", () => {
    const schema = val.number().int().default(100);
    expect(schema.validate(undefined)).toEqual({ ok: true, value: 100 });
    expect(schema.validate(50)).toEqual({ ok: true, value: 50 });
  });

  it("does not mutate receiver when chaining constraints", () => {
    const base = val.number().gt(0);
    const bounded = base.lt(10);

    expect(base.validate(20).ok).toBe(true);
    expect(bounded.validate(20).ok).toBe(false);
  });
});

describe("NumberValidator Phase 2 clamp()", () => {
  it("clamps numbers above the maximum boundary", () => {
    const schema = val.number().clamp(0, 10);
    expect(schema.validate(15)).toEqual({ ok: true, value: 10 });
  });

  it("clamps numbers below the minimum boundary", () => {
    const schema = val.number().clamp(0, 10);
    expect(schema.validate(-5)).toEqual({ ok: true, value: 0 });
  });

  it("preserves numbers within boundaries unchanged", () => {
    const schema = val.number().clamp(0, 10);
    expect(schema.validate(7)).toEqual({ ok: true, value: 7 });
    expect(schema.validate(0)).toEqual({ ok: true, value: 0 });
    expect(schema.validate(10)).toEqual({ ok: true, value: 10 });
  });

  it("supports negative clamp ranges", () => {
    const schema = val.number().clamp(-20, -10);
    expect(schema.validate(-5)).toEqual({ ok: true, value: -10 });
    expect(schema.validate(-25)).toEqual({ ok: true, value: -20 });
    expect(schema.validate(-15)).toEqual({ ok: true, value: -15 });
  });

  it("rejects invalid clamp configurations", () => {
    const invalidBounds = val.number().clamp(10, 0);
    expect(invalidBounds.validate(5)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Clamp bounds must be finite numbers and min <= max",
        path: [],
      },
    });

    const nanBounds = val.number().clamp(Number.NaN, 10);
    expect(nanBounds.validate(5)).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Clamp bounds must be finite numbers and min <= max",
        path: [],
      },
    });
  });

  it("chains with subsequent validators using clamped value", () => {
    const schema = val.number().clamp(0, 10).max(10);
    expect(schema.validate(100)).toEqual({ ok: true, value: 10 });
  });

  it("does not mutate receiver when calling clamp()", () => {
    const base = val.number();
    const clamped = base.clamp(0, 5);

    expect(base.validate(10)).toEqual({ ok: true, value: 10 });
    expect(clamped.validate(10)).toEqual({ ok: true, value: 5 });
  });
});
