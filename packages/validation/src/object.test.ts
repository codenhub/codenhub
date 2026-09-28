import { describe, expect, it } from "vitest";

import { type Infer, type InferObject, type ValidationErr, val } from ".";

describe("ObjectValidator", () => {
  it("validates valid object according to shape", () => {
    const userSchema = val.object({
      name: val.string().min(2),
      age: val.number().min(0),
    });

    const result = userSchema.validate({
      name: "Alice",
      age: 30,
    });

    expect(result).toEqual({
      ok: true,
      value: { name: "Alice", age: 30 },
    });
  });

  it("rejects non-plain objects", () => {
    const schema = val.object({ name: val.string() });

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

    expect(schema.validate([1, 2, 3])).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected object, got array",
        path: [],
        expected: "plain object",
        received: "array",
      },
    });

    expect(schema.validate("string")).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected object, got string",
        path: [],
        expected: "plain object",
        received: "string",
      },
    });
  });

  it("strips unrecognized keys by default", () => {
    const schema = val.object({
      id: val.number(),
    });

    const result = schema.validate({
      id: 1,
      extra: "discarded",
      nested: { ignore: true },
    });

    expect(result).toEqual({
      ok: true,
      value: { id: 1 },
    });
  });

  it("rejects unrecognized keys in strict mode", () => {
    const schema = val
      .object({
        id: val.number(),
      })
      .strict();

    const result = schema.validate({
      id: 1,
      extra: "not allowed",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Unrecognized key: extra",
        path: ["extra"],
      },
    });
  });

  it("supports custom strict error message", () => {
    const schema = val
      .object({
        id: val.number(),
      })
      .strict("No extra properties allowed");

    const result = schema.validate({
      id: 1,
      extra: "not allowed",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "No extra properties allowed",
        path: ["extra"],
      },
    });
  });

  it("preserves unrecognized keys in passthrough mode", () => {
    const schema = val
      .object({
        id: val.number(),
      })
      .passthrough();

    const result = schema.validate({
      id: 1,
      extra: "preserved",
      other: 42,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: 1,
        extra: "preserved",
        other: 42,
      },
    });
  });

  it("switches back to strip mode with .strip()", () => {
    const schema = val
      .object({
        id: val.number(),
      })
      .passthrough()
      .strip();

    const result = schema.validate({
      id: 1,
      extra: "preserved",
    });

    expect(result).toEqual({
      ok: true,
      value: { id: 1 },
    });
  });

  it("handles nested object validation and deep path tracking", () => {
    const schema = val.object({
      user: val.object({
        profile: val.object({
          email: val.string().email(),
        }),
      }),
    });

    const success = schema.validate({
      user: {
        profile: {
          email: "user@example.com",
        },
      },
    });
    expect(success.ok).toBe(true);

    const failure = schema.validate({
      user: {
        profile: {
          email: "not-an-email",
        },
      },
    });

    expect(failure).toEqual({
      ok: false,
      error: {
        code: "invalid_format",
        message: "Invalid email address",
        path: ["user", "profile", "email"],
        expected: "email address",
        received: "not-an-email",
      },
    });
  });

  it("accumulates multiple issues across fields when abortEarly is false", () => {
    const schema = val.object({
      name: val.string().min(5),
      age: val.number().min(18),
    });

    const result = schema.validate({
      name: "Bob",
      age: 10,
    });

    expect(result.ok).toBe(false);
    const err = (result as ValidationErr).error;
    expect(err.issues).toHaveLength(2);
    expect(err.issues?.[0]?.path).toEqual(["name"]);
    expect(err.issues?.[1]?.path).toEqual(["age"]);
  });

  it("aborts at the first issue when abortEarly is true", () => {
    const schema = val.object({
      name: val.string().min(5),
      age: val.number().min(18),
    });

    const result = schema.validate(
      {
        name: "Bob",
        age: 10,
      },
      { abortEarly: true },
    );

    expect(result.ok).toBe(false);
    const err = (result as ValidationErr).error;
    expect(err.path).toEqual(["name"]);
    expect(err.issues).toBeUndefined();
  });

  it("supports .extend() to add and override properties", () => {
    const base = val.object({
      id: val.number(),
      name: val.string(),
    });

    const extended = base.extend({
      name: val.string().min(5),
      role: val.string(),
    });

    expect(extended.validate({ id: 1, name: "Alexander", role: "admin" })).toEqual({
      ok: true,
      value: { id: 1, name: "Alexander", role: "admin" },
    });

    expect(extended.validate({ id: 1, name: "Al", role: "admin" })).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Must be at least 5 characters",
        path: ["name"],
        expected: "at least 5 characters",
        received: "2 characters",
      },
    });
  });

  it("supports .pick() to select specific keys", () => {
    const full = val.object({
      id: val.number(),
      name: val.string(),
      password: val.string(),
    });

    const publicUser = full.pick(["id", "name"] as const);

    expect(publicUser.validate({ id: 1, name: "Alice", password: "secret" })).toEqual({
      ok: true,
      value: { id: 1, name: "Alice" },
    });
  });

  it("supports .omit() to exclude specific keys", () => {
    const full = val.object({
      id: val.number(),
      name: val.string(),
      password: val.string(),
    });

    const publicUser = full.omit(["password"] as const);

    expect(publicUser.validate({ id: 1, name: "Alice", password: "secret" })).toEqual({
      ok: true,
      value: { id: 1, name: "Alice" },
    });
  });

  it("supports .partial() to make all keys optional", () => {
    const schema = val
      .object({
        name: val.string(),
        age: val.number(),
      })
      .partial();

    expect(schema.validate({})).toEqual({
      ok: true,
      value: {},
    });

    expect(schema.validate({ name: "Alice" })).toEqual({
      ok: true,
      value: { name: "Alice" },
    });
  });

  it("supports .shape getter", () => {
    const nameValidator = val.string();
    const schema = val.object({ name: nameValidator });

    expect(schema.shape.name).toBe(nameValidator);
  });

  it("infers types correctly for required and optional keys", () => {
    const schema = val.object({
      requiredStr: val.string(),
      optionalStr: val.string().optional(),
      defaultNum: val.number().default(0),
    });

    type Inferred = Infer<typeof schema>;
    type ShapeInfer = InferObject<typeof schema.shape>;

    // Type check assertions
    const validData: Inferred = {
      requiredStr: "hello",
      optionalStr: undefined,
      defaultNum: 42,
    };
    const validShape: ShapeInfer = validData;
    expect(validShape.requiredStr).toBe("hello");
  });
});
