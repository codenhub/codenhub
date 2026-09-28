import { describe, expect, it } from "vitest";

import { type ValidationErr, type ValidationOk, val } from ".";

describe("RecordValidator", () => {
  it("validates records with valid values", () => {
    const schema = val.record(val.number().min(0));
    const result = schema.validate({
      apples: 5,
      oranges: 10,
    });

    expect(result).toEqual({
      ok: true,
      value: { apples: 5, oranges: 10 },
    });
  });

  it("validates records with valid keys and values", () => {
    const schema = val.record(val.number(), val.string().min(3));
    const result = schema.validate({
      app: 1,
      api: 2,
    });

    expect(result).toEqual({
      ok: true,
      value: { app: 1, api: 2 },
    });
  });

  it("rejects non-plain objects", () => {
    const schema = val.record(val.string());
    expect(schema.validate(null)).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected object, got null",
        path: [],
        expected: "plain object",
        received: "null",
      },
    });

    expect(schema.validate([1, 2])).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected object, got array",
        path: [],
        expected: "plain object",
        received: "array",
      },
    });
  });

  it("rejects invalid keys according to keyValidator", () => {
    const schema = val.record(val.number(), val.string().min(4));
    const result = schema.validate({
      a: 10,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Must be at least 4 characters",
        path: ["a"],
        expected: "at least 4 characters",
        received: "1 characters",
      },
    });
  });

  it("rejects invalid values according to valueValidator", () => {
    const schema = val.record(val.number().min(0));
    const result = schema.validate({
      valid: 10,
      invalid: -5,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Must be at least 0",
        path: ["invalid"],
        expected: "at least 0",
        received: "-5",
      },
    });
  });

  it("accumulates issues across keys and values", () => {
    const schema = val.record(val.number().min(0));
    const result = schema.validate({
      first: -1,
      second: -2,
    });

    expect(result.ok).toBe(false);
    const err = (result as ValidationErr).error;
    expect(err.issues).toHaveLength(2);
    expect(err.issues?.[0]?.path).toEqual(["first"]);
    expect(err.issues?.[1]?.path).toEqual(["second"]);
  });

  it("aborts early when abortEarly is true", () => {
    const schema = val.record(val.number().min(0));
    const result = schema.validate(
      {
        first: -1,
        second: -2,
      },
      { abortEarly: true },
    );

    expect(result.ok).toBe(false);
    const err = (result as ValidationErr).error;
    expect(err.path).toEqual(["first"]);
    expect(err.issues).toBeUndefined();
  });

  it("provides value and key getters", () => {
    const valSchema = val.number();
    const keySchema = val.string();
    const schema = val.record(valSchema, keySchema);

    expect(schema.value).toBe(valSchema);
    expect(schema.key).toBe(keySchema);
  });

  it("prevents prototype pollution when input contains own __proto__ key", () => {
    const raw = JSON.parse('{"__proto__": "polluted", "item": "safe"}') as Record<string, unknown>;
    const schema = val.record(val.string());
    const res = schema.validate(raw) as ValidationOk<Record<string, unknown>>;

    expect(res.ok).toBe(true);
    expect(Object.getPrototypeOf(res.value)).toBe(Object.prototype);
    expect(res.value.__proto__).toBe("polluted");
  });
});
