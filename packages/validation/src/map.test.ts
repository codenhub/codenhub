import { describe, expect, it } from "vitest";

import { type ValidationErr, val } from ".";

describe("MapValidator", () => {
  it("validates valid Map instances", () => {
    const schema = val.map(val.string(), val.number());
    const validMap = new Map([
      ["a", 1],
      ["b", 2],
    ]);

    expect(schema.validate(validMap)).toEqual({
      ok: true,
      value: validMap,
    });
  });

  it("rejects non-Map inputs", () => {
    const schema = val.map(val.string(), val.number());
    const res = schema.validate({ a: 1 }) as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("invalid_type");
    expect(res.error.message).toContain("Expected Map");
  });

  it("enforces min, max, and nonEmpty constraints immutably", () => {
    const base = val.map(val.string(), val.number());
    const min2 = base.min(2);
    const max2 = base.max(2);
    const nonEmpty = base.nonEmpty();

    expect(base.validate(new Map()).ok).toBe(true);

    expect(min2.validate(new Map([["a", 1]])).ok).toBe(false);
    expect(
      min2.validate(
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
      ).ok,
    ).toBe(true);

    expect(
      max2.validate(
        new Map([
          ["a", 1],
          ["b", 2],
          ["c", 3],
        ]),
      ).ok,
    ).toBe(false);
    expect(
      max2.validate(
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
      ).ok,
    ).toBe(true);

    expect(nonEmpty.validate(new Map()).ok).toBe(false);
    expect(nonEmpty.validate(new Map([["a", 1]])).ok).toBe(true);
  });

  it("tracks key and value failure paths", () => {
    const schema = val.map(val.string().min(2), val.number().min(0));

    const invalidValueMap = new Map([["ok", -5]]);
    const resVal = schema.validate(invalidValueMap) as ValidationErr;
    expect(resVal.ok).toBe(false);
    expect(resVal.error.path).toEqual(["ok"]);

    const invalidKeyMap = new Map([["x", 10]]);
    const resKey = schema.validate(invalidKeyMap) as ValidationErr;
    expect(resKey.ok).toBe(false);
    expect(resKey.error.path).toEqual(["x"]);
  });

  it("supports asynchronous validation with async key and value schemas", async () => {
    const schema = val.map(
      val.string().refineAsync(async (k) => k.startsWith("k_"), "Key must start with k_"),
      val.number().refineAsync(async (v) => v > 0, "Value must be positive"),
    );

    const validMap = new Map([["k_1", 10]]);
    const validRes = await schema.validateAsync(validMap);
    expect(validRes).toEqual({
      ok: true,
      value: validMap,
    });

    const invalidMap = new Map([["wrong", -1]]);
    const invalidRes = (await schema.validateAsync(invalidMap)) as ValidationErr;
    expect(invalidRes.ok).toBe(false);
  });

  it("provides key and value getters", () => {
    const keySchema = val.string();
    const valSchema = val.number();
    const schema = val.map(keySchema, valSchema);

    expect(schema.key).toBe(keySchema);
    expect(schema.value).toBe(valSchema);
  });
});
