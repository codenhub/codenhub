import { describe, expect, expectTypeOf, it } from "vitest";

import { val, type Infer } from "./index";
import { codesOf, issuesOf, messagesOf, pathsOf, valueOf } from "./test-utils";

const user = val.object({ name: val.string(), age: val.number().optional() });

describe("object", () => {
  it("validates each property and returns a new object", () => {
    const input = { name: "Ada", age: 36 };
    const output = valueOf(user.validate(input));
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it("rejects non-objects, arrays, null and class instances, naming the received type", () => {
    expect(messagesOf(user.validate(null))).toEqual(["Expected object, received null"]);
    expect(messagesOf(user.validate([]))).toEqual(["Expected object, received array"]);
    expect(messagesOf(user.validate("x"))).toEqual(["Expected object, received string"]);
    class Person {
      name = "Ada";
    }
    expect(messagesOf(user.validate(new Person()))).toEqual(["Expected object, received Person"]);
  });

  it("accepts null-prototype objects", () => {
    expect(user.validate(Object.assign(Object.create(null), { name: "a" })).ok).toBe(true);
  });

  it("uses a custom message for the type failure", () => {
    expect(messagesOf(val.object({}, "need an object").validate(1))).toEqual(["need an object"]);
  });

  it("reports missing required properties at their path", () => {
    expect(pathsOf(user.validate({}))).toEqual([["name"]]);
    expect(codesOf(user.validate({}))).toEqual(["invalid_type"]);
  });

  it("collects issues from every property, with nested paths", () => {
    const schema = val.object({
      user: val.object({ emails: val.array(val.string().email()) }),
      count: val.number(),
    });
    const result = schema.validate({ user: { emails: ["a@b.co", "nope", 3] }, count: "x" });
    expect(pathsOf(result)).toEqual([["user", "emails", 1], ["user", "emails", 2], ["count"]]);
  });

  it("only reads own properties", () => {
    const inherited = Object.create({ name: "Ada" }) as Record<string, unknown>;
    expect(user.validate(inherited).ok).toBe(false);
    expect(user.validate({ ...inherited, name: "x" }).ok).toBe(true);
  });

  it("defaults, optional and nullable behave inside objects", () => {
    const schema = val.object({ a: val.string().default("z"), b: val.string().optional(), c: val.string().nullable() });
    expect(valueOf(schema.validate({ c: null }))).toEqual({ a: "z", c: null });
    expect(Object.hasOwn(valueOf(schema.validate({ c: null })), "b")).toBe(false);
    expect(Object.hasOwn(valueOf(schema.validate({ b: undefined, c: null })), "b")).toBe(true);
  });

  it("makes properties that accept undefined optional in the inferred type", () => {
    const schema = val.object({ a: val.string(), b: val.string().optional(), c: val.number().default(0) });
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<{ a: string; c: number; b?: string | undefined }>();
  });
});

describe("unknown keys", () => {
  const schema = val.object({ a: val.string() });
  const input = { a: "x", extra: 1 };

  it("strips them by default", () => {
    expect(valueOf(schema.validate(input))).toEqual({ a: "x" });
  });

  it("rejects them in strict mode, one issue per key", () => {
    const result = schema.strict().validate({ a: "x", b: 1, c: 2 });
    expect(pathsOf(result)).toEqual([["b"], ["c"]]);
    expect(codesOf(result)).toEqual(["unrecognized_key", "unrecognized_key"]);
  });

  it("keeps them in passthrough mode without validating them", () => {
    expect(valueOf(schema.passthrough().validate(input))).toEqual(input);
  });

  it("can switch back to strip", () => {
    expect(valueOf(schema.strict().strip().validate(input))).toEqual({ a: "x" });
  });

  it("treats __proto__ from JSON as data, never as a prototype write", () => {
    const payload = JSON.parse('{"a":"x","__proto__":{"polluted":true}}') as unknown;
    const output = valueOf(schema.passthrough().validate(payload));
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(output, "__proto__")).toBe(true);
  });

  it("keeps rules added before switching mode", () => {
    const checked = schema.refine((value) => value.a !== "bad").strict();
    expect(checked.validate({ a: "bad" }).ok).toBe(false);
    expect(checked.validate({ a: "x", b: 1 }).ok).toBe(false);
  });

  it("stops at the first unknown key with abortEarly", () => {
    expect(issuesOf(schema.strict().validate({ a: "x", b: 1, c: 2 }, { abortEarly: true }))).toHaveLength(1);
  });
});

describe("shape operations", () => {
  const base = val.object({ a: val.string(), b: val.number(), c: val.boolean() });

  it("extend adds and replaces properties", () => {
    const extended = base.extend({ b: val.string(), d: val.null() });
    expect(extended.validate({ a: "x", b: "y", c: true, d: null }).ok).toBe(true);
    expect(extended.validate({ a: "x", b: 1, c: true, d: null }).ok).toBe(false);
    expect(Object.keys(extended.shape)).toEqual(["a", "b", "c", "d"]);
  });

  it("extend accepts the shape of another object", () => {
    const merged = base.extend(val.object({ z: val.string() }).shape);
    expect(merged.validate({ a: "", b: 1, c: true, z: "" }).ok).toBe(true);
  });

  it("pick keeps only the listed properties", () => {
    const picked = base.pick(["a", "c"]);
    expect(Object.keys(picked.shape)).toEqual(["a", "c"]);
    expectTypeOf<Infer<typeof picked>>().toEqualTypeOf<{ a: string; c: boolean }>();
  });

  it("omit removes the listed properties", () => {
    const omitted = base.omit(["a"]);
    expect(Object.keys(omitted.shape)).toEqual(["b", "c"]);
    expectTypeOf<Infer<typeof omitted>>().toEqualTypeOf<{ b: number; c: boolean }>();
  });

  it("partial makes every property optional", () => {
    const partial = base.partial();
    expect(partial.validate({}).ok).toBe(true);
    expect(partial.validate({ a: 1 }).ok).toBe(false);
    expectTypeOf<Infer<typeof partial>>().toEqualTypeOf<{
      a?: string | undefined;
      b?: number | undefined;
      c?: boolean | undefined;
    }>();
  });

  it("required undoes partial for all or some properties", () => {
    const partial = base.partial();
    expect(partial.required().validate({}).ok).toBe(false);
    const some = partial.required(["a"]);
    expect(pathsOf(some.validate({}))).toEqual([["a"]]);
    expectTypeOf<Infer<typeof some>>().toEqualTypeOf<{ a: string; b?: number | undefined; c?: boolean | undefined }>();
  });

  it("required leaves properties that are not optional alone", () => {
    expect(base.required().validate({ a: "", b: 1, c: true }).ok).toBe(true);
  });

  it("keyof validates against the property names", () => {
    const keys = base.keyof();
    expect(keys.validate("a").ok).toBe(true);
    expect(keys.validate("z").ok).toBe(false);
  });

  it("keeps the unknown-key mode", () => {
    expect(base.strict().pick(["a"]).validate({ a: "", b: 1 }).ok).toBe(false);
  });

  it("does not mutate the original", () => {
    base.extend({ z: val.string() });
    base.pick(["a"]);
    expect(Object.keys(base.shape)).toEqual(["a", "b", "c"]);
  });
});

describe("cross-field validation", () => {
  const signup = val
    .object({ password: val.string().min(8), confirm: val.string() })
    .refine((data) => data.password === data.confirm, { message: "Passwords must match", path: ["confirm"] });

  it("runs once the properties are valid, and points at the offending field", () => {
    expect(pathsOf(signup.validate({ password: "12345678", confirm: "1234567" }))).toEqual([["confirm"]]);
    expect(signup.validate({ password: "12345678", confirm: "12345678" }).ok).toBe(true);
  });

  it("does not run when a property is invalid", () => {
    expect(pathsOf(signup.validate({ password: "short", confirm: "x" }))).toEqual([["password"]]);
  });
});

describe("async properties", () => {
  it("validates asynchronous properties together", async () => {
    const schema = val.object({
      a: val.string().refine(async (value) => value === "a", "not a"),
      b: val.string().refine(async (value) => value === "b", "not b"),
    });
    expect(pathsOf(await schema.validateAsync({ a: "x", b: "y" }))).toEqual([["a"], ["b"]]);
  });
});
