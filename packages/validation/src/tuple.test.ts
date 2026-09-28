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
});
