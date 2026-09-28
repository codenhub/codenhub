import { describe, expect, it } from "vitest";

import { type InferTuple, type ValidationErr, val } from ".";

describe("TupleValidator", () => {
  it("validates tuples matching the expected schemas", () => {
    const schema = val.tuple([val.string(), val.number(), val.boolean()]);
    const result = schema.validate(["hello", 42, true]);

    expect(result).toEqual({
      ok: true,
      value: ["hello", 42, true],
    });
  });

  it("rejects non-array input", () => {
    const schema = val.tuple([val.string()]);
    expect(schema.validate("not an array")).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected array, got not an array",
        path: [],
        expected: "tuple",
        received: "not an array",
      },
    });
  });

  it("rejects input of incorrect length", () => {
    const schema = val.tuple([val.string(), val.number()]);

    expect(schema.validate(["only one"])).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Expected tuple of length 2, got 1",
        path: [],
        expected: "2 items",
        received: "1 items",
      },
    });

    expect(schema.validate(["one", 2, "extra"])).toEqual({
      ok: false,
      error: {
        code: "invalid_value",
        message: "Expected tuple of length 2, got 3",
        path: [],
        expected: "2 items",
        received: "3 items",
      },
    });
  });

  it("tracks element indices for positional errors", () => {
    const schema = val.tuple([val.string(), val.number().min(0)]);
    const result = schema.validate(["hello", -10]);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Must be at least 0",
        path: [1],
        expected: "at least 0",
        received: "-10",
      },
    });
  });

  it("accumulates positional errors across indices", () => {
    const schema = val.tuple([val.string().min(5), val.number().min(0)]);
    const result = schema.validate(["hi", -10]);

    expect(result.ok).toBe(false);
    const err = (result as ValidationErr).error;
    expect(err.issues).toHaveLength(2);
    expect(err.issues?.[0]?.path).toEqual([0]);
    expect(err.issues?.[1]?.path).toEqual([1]);
  });

  it("aborts on first positional error when abortEarly is true", () => {
    const schema = val.tuple([val.string().min(5), val.number().min(0)]);
    const result = schema.validate(["hi", -10], { abortEarly: true });

    expect(result.ok).toBe(false);
    const err = (result as ValidationErr).error;
    expect(err.path).toEqual([0]);
    expect(err.issues).toBeUndefined();
  });

  it("provides items getter and infers tuple types", () => {
    const items = [val.string(), val.number()] as const;
    const schema = val.tuple(items);

    expect(schema.items).toBe(items);

    type Inferred = InferTuple<typeof items>;
    const tupleData: Inferred = ["test", 123];
    expect(tupleData[0]).toBe("test");
  });

  it("supports trailing rest elements with .rest()", () => {
    const base = val.tuple([val.string(), val.number()]);
    const withRest = base.rest(val.boolean());

    expect(withRest.validate(["hello", 42])).toEqual({
      ok: true,
      value: ["hello", 42],
    });
    expect(withRest.validate(["hello", 42, true, false, true])).toEqual({
      ok: true,
      value: ["hello", 42, true, false, true],
    });

    const tooShort = withRest.validate(["hello"]) as ValidationErr;
    expect(tooShort.ok).toBe(false);
    expect(tooShort.error.code).toBe("too_small");

    const badRest = withRest.validate(["hello", 42, true, "not a bool"]) as ValidationErr;
    expect(badRest.ok).toBe(false);
    expect(badRest.error.path).toEqual([3]);
    expect(badRest.error.code).toBe("invalid_type");

    expect(withRest.restElement).toBeDefined();
  });

  it("is 100% immutable when attaching .rest()", () => {
    const base = val.tuple([val.string()]);
    const withRest = base.rest(val.number());

    expect(base.validate(["a", 1]).ok).toBe(false);
    expect(withRest.validate(["a", 1]).ok).toBe(true);
  });

  it("supports asynchronous validation with async items and rest elements", async () => {
    const schema = val
      .tuple([val.string().refineAsync(async (s) => s.length > 2, "Too short")])
      .rest(val.number().refineAsync(async (n) => n > 0, "Must be positive"));

    const valid = await schema.validateAsync(["abc", 1, 2]);
    expect(valid).toEqual({
      ok: true,
      value: ["abc", 1, 2],
    });

    const invalidItem = (await schema.validateAsync(["a", 1])) as ValidationErr;
    expect(invalidItem.ok).toBe(false);
    expect(invalidItem.error.path).toEqual([0]);

    const invalidRest = (await schema.validateAsync(["abc", -1])) as ValidationErr;
    expect(invalidRest.ok).toBe(false);
    expect(invalidRest.error.path).toEqual([1]);
  });
});
