import { describe, expect, it } from "vitest";

import { deepMerge, type ValidationErr, val } from ".";

describe("IntersectionValidator", () => {
  it("validates and deeply merges two object schemas", () => {
    const person = val.object({
      name: val.string(),
      details: val.object({
        age: val.number(),
      }),
    });

    const employee = val.object({
      role: val.string(),
      details: val.object({
        department: val.string(),
      }),
    });

    const schema = val.intersection(person, employee);

    const result = schema.validate({
      name: "Alice",
      role: "Engineer",
      details: {
        age: 30,
        department: "Core",
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        name: "Alice",
        role: "Engineer",
        details: {
          age: 30,
          department: "Core",
        },
      },
    });
  });

  it("works with .and() on BaseValidator instances", () => {
    const schemaA = val.object({ a: val.string() });
    const schemaB = val.object({ b: val.number() });

    const intersected = schemaA.and(schemaB);

    const res = intersected.validate({ a: "test", b: 42 });
    expect(res).toEqual({
      ok: true,
      value: { a: "test", b: 42 },
    });
  });

  it("validates primitive intersections", () => {
    const schema = val.string().min(3).and(val.string().max(5));

    expect(schema.validate("abc").ok).toBe(true);
    expect(schema.validate("abcde").ok).toBe(true);
    expect(schema.validate("ab").ok).toBe(false);
    expect(schema.validate("abcdef").ok).toBe(false);
  });

  it("fails when either schema fails", () => {
    const schema = val.intersection(val.object({ name: val.string() }), val.object({ age: val.number() }));

    const res = schema.validate({ name: "Alice", age: "not a number" }) as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.path).toEqual(["age"]);
  });

  it("accumulates issues from both sides when abortEarly is false", () => {
    const schema = val.intersection(val.object({ name: val.string() }), val.object({ age: val.number() }));

    const res = schema.validate({ name: 123, age: "invalid" }, { abortEarly: false }) as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.issues).toHaveLength(2);
  });

  it("supports asynchronous validation with async schemas", async () => {
    const asyncA = val.object({
      code: val.string().refineAsync(async (s) => s.startsWith("AC-"), "Must start with AC-"),
    });
    const asyncB = val.object({
      score: val.number().min(0),
    });

    const schema = val.intersection(asyncA, asyncB);

    const valid = await schema.validateAsync({ code: "AC-100", score: 95 });
    expect(valid).toEqual({
      ok: true,
      value: { code: "AC-100", score: 95 },
    });

    const invalid = (await schema.validateAsync({ code: "WRONG", score: -1 })) as ValidationErr;
    expect(invalid.ok).toBe(false);
    expect(invalid.error.issues).toHaveLength(2);
  });

  it("deepMerge protects against prototype pollution", () => {
    const evil = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>;
    const target = { a: 1 };
    const merged = deepMerge(target, evil) as Record<string, unknown>;

    expect(merged.a).toBe(1);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
