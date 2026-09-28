import { describe, expect, it } from "vitest";

import { type ValidationErr, val } from ".";

describe("ArrayValidator", () => {
  it("validates valid array without element schema", () => {
    const schema = val.array();
    expect(schema.validate([1, "a", true])).toEqual({
      ok: true,
      value: [1, "a", true],
    });
  });

  it("validates valid array with element schema", () => {
    const schema = val.array(val.number().min(0));
    expect(schema.validate([1, 2, 3])).toEqual({
      ok: true,
      value: [1, 2, 3],
    });
  });

  it("rejects non-array inputs", () => {
    const schema = val.array(val.string());
    expect(schema.validate("not an array")).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected array, got not an array",
        path: [],
        expected: "array",
        received: "not an array",
      },
    });
  });

  it("tracks deep element indices in failure paths", () => {
    const schema = val.object({
      items: val.array(
        val.object({
          price: val.number().min(0),
        }),
      ),
    });

    const result = schema.validate({
      items: [{ price: 10 }, { price: 20 }, { price: -5 }],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Must be at least 0",
        path: ["items", 2, "price"],
        expected: "at least 0",
        received: "-5",
      },
    });
  });

  it("enforces min, max, and length constraints", () => {
    const minSchema = val.array(val.number()).min(2);
    expect(minSchema.validate([1])).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Must contain at least 2 items",
        path: [],
        expected: "at least 2 items",
        received: "1 items",
      },
    });
    expect(minSchema.validate([1, 2])).toEqual({
      ok: true,
      value: [1, 2],
    });

    const maxSchema = val.array(val.number()).max(2);
    expect(maxSchema.validate([1, 2, 3])).toEqual({
      ok: false,
      error: {
        code: "too_big",
        message: "Must contain at most 2 items",
        path: [],
        expected: "at most 2 items",
        received: "3 items",
      },
    });

    const exactSchema = val.array(val.number()).length(2);
    expect(exactSchema.validate([1])).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Must contain exactly 2 items",
        path: [],
        expected: "2 items",
        received: "1 items",
      },
    });
    expect(exactSchema.validate([1, 2])).toEqual({
      ok: true,
      value: [1, 2],
    });
  });

  it("enforces nonEmpty constraint", () => {
    const schema = val.array().nonEmpty();
    expect(schema.validate([])).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Array cannot be empty",
        path: [],
        expected: "non-empty array",
        received: "empty array",
      },
    });
    expect(schema.validate([1])).toEqual({
      ok: true,
      value: [1],
    });
  });

  it("supports aliases minLength, maxLength, and notEmpty", () => {
    const schema = val.array().minLength(2).maxLength(4).notEmpty();
    expect(schema.validate([1, 2, 3])).toEqual({
      ok: true,
      value: [1, 2, 3],
    });
    expect(schema.validate([1])).toMatchObject({
      ok: false,
      error: { code: "too_small" },
    });
  });

  it("provides .element getter", () => {
    const elementSchema = val.string();
    const schema = val.array(elementSchema);
    expect(schema.element).toBe(elementSchema);
  });

  it("accumulates multiple element issues when abortEarly is false", () => {
    const schema = val.array(val.number().min(0));
    const result = schema.validate([-1, 10, -3]);

    expect(result.ok).toBe(false);
    const err = (result as ValidationErr).error;
    expect(err.issues).toHaveLength(2);
    expect(err.issues?.[0]?.path).toEqual([0]);
    expect(err.issues?.[1]?.path).toEqual([2]);
  });

  it("stops at first element issue when abortEarly is true", () => {
    const schema = val.array(val.number().min(0));
    const result = schema.validate([-1, 10, -3], { abortEarly: true });

    expect(result.ok).toBe(false);
    const err = (result as ValidationErr).error;
    expect(err.path).toEqual([0]);
    expect(err.issues).toBeUndefined();
  });

  it("is 100% immutable across constraint methods", () => {
    const base = val.array();
    const min2 = base.min(2);
    const max2 = min2.max(4);

    expect(base.validate([]).ok).toBe(true);
    expect(min2.validate([]).ok).toBe(false);
    expect(min2.validate([1, 2, 3, 4, 5]).ok).toBe(true);
    expect(max2.validate([1, 2, 3, 4, 5]).ok).toBe(false);
  });

  it("enforces uniqueness of primitive values with .unique()", () => {
    const schema = val.array().unique();

    expect(schema.validate([1, 2, 3])).toEqual({
      ok: true,
      value: [1, 2, 3],
    });

    const duplicate = schema.validate([1, 2, 1]) as ValidationErr;
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error.code).toBe("invalid_value");
    expect(duplicate.error.path).toEqual([2]);
  });

  it("enforces uniqueness with custom keySelector", () => {
    const schema = val.array(val.object({ id: val.number() })).unique((item) => item.id, "ID must be unique");

    expect(schema.validate([{ id: 1 }, { id: 2 }])).toEqual({
      ok: true,
      value: [{ id: 1 }, { id: 2 }],
    });

    const duplicate = schema.validate([{ id: 1 }, { id: 1 }]) as ValidationErr;
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error.message).toBe("ID must be unique");
    expect(duplicate.error.path).toEqual([1]);
  });

  it("supports asynchronous validation of array items with validateAsync()", async () => {
    const schema = val.array(val.string().refineAsync(async (s) => s.length > 2, "Must have length > 2"));

    const valid = await schema.validateAsync(["abc", "def"]);
    expect(valid).toEqual({
      ok: true,
      value: ["abc", "def"],
    });

    const invalid = (await schema.validateAsync(["abc", "no"])) as ValidationErr;
    expect(invalid.ok).toBe(false);
    expect(invalid.error.path).toEqual([1]);
    expect(invalid.error.message).toBe("Must have length > 2");
  });
});
