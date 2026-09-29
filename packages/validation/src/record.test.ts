import { describe, expect, expectTypeOf, it } from "vitest";

import { val, type Infer } from "./index";
import { codesOf, issuesOf, messagesOf, pathsOf, valueOf } from "./test-utils";

describe("record", () => {
  const scores = val.record(val.string(), val.number());

  it("validates every value", () => {
    expect(valueOf(scores.validate({ a: 1, b: 2 }))).toEqual({ a: 1, b: 2 });
    expect(pathsOf(scores.validate({ a: 1, b: "x", c: "y" }))).toEqual([["b"], ["c"]]);
    expectTypeOf<Infer<typeof scores>>().toEqualTypeOf<Record<string, number>>();
  });

  it("validates every key, locating the issue at the entry", () => {
    const schema = val.record(val.string().min(2), val.number());
    const result = schema.validate({ a: 1, bb: 2 });
    expect(pathsOf(result)).toEqual([["a"]]);
    expect(codesOf(result)).toEqual(["too_small"]);
  });

  it("uses the key validator's output as the key", () => {
    expect(valueOf(val.record(val.string().toLowerCase(), val.number()).validate({ A: 1 }))).toEqual({ a: 1 });
  });

  it("makes literal keys optional in the type, since they are not required", () => {
    const byRole = val.record(val.enum(["admin", "user"]), val.number());
    expect(byRole.validate({ admin: 1 }).ok).toBe(true);
    expect(byRole.validate({ guest: 1 }).ok).toBe(false);
    expectTypeOf<Infer<typeof byRole>>().toEqualTypeOf<Partial<Record<"admin" | "user", number>>>();
  });

  it("rejects non-objects", () => {
    expect(messagesOf(scores.validate([]))).toEqual(["Expected object, received array"]);
  });

  it("keeps a __proto__ key as data", () => {
    const output = valueOf(scores.validate(JSON.parse('{"__proto__":1}')));
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.hasOwn(output, "__proto__")).toBe(true);
  });

  it("stops at the first failing entry with abortEarly", () => {
    expect(issuesOf(scores.validate({ a: "x", b: "y" }, { abortEarly: true }))).toHaveLength(1);
  });
});
