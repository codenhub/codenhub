import { describe, expect, it } from "vitest";

import { type ValidationErr, val } from ".";

describe("SetValidator", () => {
  it("validates arbitrary Set without item schema", () => {
    const schema = val.set();
    const mySet = new Set([1, "a", true]);

    expect(schema.validate(mySet)).toEqual({
      ok: true,
      value: mySet,
    });
  });

  it("validates Set with item schema", () => {
    const schema = val.set(val.number().min(0));
    const validSet = new Set([1, 2, 3]);

    expect(schema.validate(validSet)).toEqual({
      ok: true,
      value: validSet,
    });
  });

  it("rejects non-Set inputs", () => {
    const schema = val.set();
    const res = schema.validate([1, 2, 3]) as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("invalid_type");
    expect(res.error.message).toContain("Expected Set");
  });

  it("enforces min, max, and nonEmpty constraints immutably", () => {
    const base = val.set();
    const min2 = base.min(2);
    const max2 = base.max(2);
    const nonEmpty = base.nonEmpty();

    expect(base.validate(new Set()).ok).toBe(true);

    expect(min2.validate(new Set([1])).ok).toBe(false);
    expect(min2.validate(new Set([1, 2])).ok).toBe(true);

    expect(max2.validate(new Set([1, 2, 3])).ok).toBe(false);
    expect(max2.validate(new Set([1, 2])).ok).toBe(true);

    expect(nonEmpty.validate(new Set()).ok).toBe(false);
    expect(nonEmpty.validate(new Set([1])).ok).toBe(true);
  });

  it("tracks element indices on failure", () => {
    const schema = val.set(val.string().min(2));
    const badSet = new Set(["ok", "a", "fine"]);

    const res = schema.validate(badSet) as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.path).toEqual([1]);
    expect(res.error.code).toBe("too_small");
  });

  it("supports asynchronous validation with async item schemas", async () => {
    const schema = val.set(val.string().refineAsync(async (s) => s.length > 2, "Too short"));

    const validSet = new Set(["foo", "bar"]);
    const validRes = await schema.validateAsync(validSet);
    expect(validRes).toEqual({
      ok: true,
      value: validSet,
    });

    const invalidSet = new Set(["ok", "hi"]);
    const invalidRes = (await schema.validateAsync(invalidSet)) as ValidationErr;
    expect(invalidRes.ok).toBe(false);
    expect(invalidRes.error.path).toEqual([0]);
    expect(invalidRes.error.message).toBe("Too short");
  });

  it("provides element getter", () => {
    const itemSchema = val.number();
    const schema = val.set(itemSchema);
    expect(schema.element).toBe(itemSchema);
  });
});
