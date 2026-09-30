import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { intersection } from "./intersection";
import { object } from "./object";

describe("intersection", () => {
  const named = object({ name: string() });
  const aged = object({ age: number() });
  const both = intersection(named, aged);

  it("should accept a value that passes both and merge the outputs", () => {
    expect(valueOf(both({ name: "Ada", age: 36 }))).toEqual({ name: "Ada", age: 36 });
  });

  it("should give an intersection type", () => {
    const value: { name: string } & { age: number } = valueOf(both({ name: "Ada", age: 36 }));
    expect(value.age).toBe(36);
  });

  it("should report the issues of both sides together", () => {
    expect(issuesOf(both({})).map((issue) => issue.path)).toEqual([["name"], ["age"]]);
  });

  it("should report only the failing side", () => {
    expect(issuesOf(both({ name: "Ada" })).map((issue) => issue.path)).toEqual([["age"]]);
  });

  it("should merge nested objects recursively, and let the right side win for other values", () => {
    const left = object({ profile: object({ a: number() }), tag: string() });
    const right = object({ profile: object({ b: number() }), tag: string({ uppercase: true }) });
    expect(valueOf(intersection(left, right)({ profile: { a: 1, b: 2 }, tag: "x" }))).toEqual({
      profile: { a: 1, b: 2 },
      tag: "X",
    });
  });

  it("should not let a __proto__ key write to a prototype while merging", () => {
    const parsed = JSON.parse('{"__proto__": {"admin": true}}') as unknown;
    const loose = object({}, { unknownKeys: "passthrough" });
    const output = valueOf(intersection(loose, loose)(parsed));
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
  });

  it("should keep a value both sides passed through as it is, so cyclic input does not recurse forever", () => {
    const cyclic: Record<string, unknown> = { name: "a" };
    cyclic["self"] = cyclic;
    const open = object({ name: string() }, { unknownKeys: "passthrough" });
    const merged = valueOf(intersection(open, open)(cyclic)) as Record<string, unknown>;
    expect(merged["self"]).toBe(cyclic);
    expect(merged["name"]).toBe("a");
  });

  it("should fail with the issues of a non-object input on both sides", () => {
    expect(codesOf(both(null))).toEqual(["invalid_type", "invalid_type"]);
  });

  it("should be asynchronous when a side is", async () => {
    const both2 = intersection(object({ name: isFree }), aged);
    const result = both2({ name: "taken", age: 1 });
    expect(isPending(result)).toBe(true);
    expect(codesOf(await result)).toEqual(["taken"]);
    expect(isPending(both({ name: "a", age: 1 }))).toBe(false);
  });
});
