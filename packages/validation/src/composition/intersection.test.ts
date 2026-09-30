import { describe, expect, it } from "vitest";

import { coerceDate } from "../coercion/coerce-date";
import { date } from "../primitives/date";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { array } from "./array";
import { intersection } from "./intersection";
import { json } from "./json";
import { map } from "./map";
import { object } from "./object";
import { set } from "./set";
import { transform } from "./transform";

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

  it("should merge nested objects recursively, and keep a value both sides produced equally", () => {
    const left = object({ profile: object({ a: number() }), tag: string() });
    const right = object({ profile: object({ b: number() }), tag: string({ min: 1 }) });
    expect(valueOf(intersection(left, right)({ profile: { a: 1, b: 2 }, tag: "x" }))).toEqual({
      profile: { a: 1, b: 2 },
      tag: "x",
    });
  });

  it("should merge arrays of the same length item by item", () => {
    const ids = array(object({ id: number() }));
    const names = array(object({ name: string() }));
    expect(valueOf(intersection(ids, names)([{ id: 1, name: "a" }]))).toEqual([{ id: 1, name: "a" }]);
  });

  it("should merge two maps entry by entry, recursively, and report a conflict at the entry's key", () => {
    const counts = map(string(), object({ count: number() }));
    const labels = map(string(), object({ label: string() }));
    const merged = valueOf(intersection(counts, labels)(new Map([["a", { count: 1, label: "A" }]])));
    expect(merged).toEqual(new Map([["a", { count: 1, label: "A" }]]));
    const trimmed = map(string(), string({ trim: true }));
    const upper = map(string(), string({ uppercase: true }));
    expect(issuesOf(intersection(trimmed, upper)(new Map([["k", " a "]])))).toEqual([
      { code: "invalid_intersection", path: ["k"] },
    ]);
  });

  it("should accept two sets that hold the same values, and report sets that differ", () => {
    const ids = set(number());
    expect(valueOf(intersection(ids, set(number({ int: true })))(new Set([1, 2])))).toEqual(new Set([1, 2]));
    const shifted = transform(set(number()), (values) => new Set([...values].map((value) => value + 1)));
    expect(codesOf(intersection(ids, shifted)(new Set([1])))).toEqual(["invalid_intersection"]);
  });

  it("should treat dates holding the same moment as equal", () => {
    const window = intersection(coerceDate({ min: new Date(0) }), coerceDate({ max: new Date(2e12) }));
    const value = valueOf(window("2026-01-01"));
    expect(value).toEqual(new Date("2026-01-01"));
    expect(valueOf(intersection(date(), date())(value))).toBe(value);
  });

  it("should report outputs that cannot be merged as invalid_intersection at the conflict, not keep one", () => {
    expect(issuesOf(intersection(string({ trim: true }), string({ uppercase: true }))("  ab "))).toEqual([
      { code: "invalid_intersection", path: [] },
    ]);
    const left = object({ tags: array(string()) });
    const right = object({ tags: transform(array(string()), (tags) => tags.slice(1)) });
    expect(issuesOf(intersection(left, right)({ tags: ["a", "b"] }))).toEqual([
      { code: "invalid_intersection", path: ["tags"] },
    ]);
    const nested = intersection(
      object({ a: array(object({ n: number() })) }),
      object({ a: array(object({ n: number({ clamp: { min: 0, max: 1 } }) })) }),
    );
    expect(issuesOf(nested({ a: [{ n: 0 }, { n: 5 }] }))).toEqual([
      { code: "invalid_intersection", path: ["a", 1, "n"] },
    ]);
    const dated = intersection(
      transform(number(), (time) => new Date(time)),
      transform(number(), (time) => new Date(time + 1)),
    );
    expect(codesOf(dated(0))).toEqual(["invalid_intersection"]);
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

  it("should merge outputs nested far deeper than the stack allows instead of throwing", () => {
    const depth = 20_000;
    const text = "[".repeat(depth) + "]".repeat(depth);
    expect(intersection(json(), json())(text).ok).toBe(true);
    const conflicting = intersection(
      json(),
      transform(json(), (): unknown[] => JSON.parse(`${"[".repeat(depth)}1${"]".repeat(depth)}`) as unknown[]),
    );
    const [issue] = issuesOf(conflicting(`${"[".repeat(depth)}2${"]".repeat(depth)}`));
    expect(issue?.code).toBe("invalid_intersection");
    expect(issue?.path).toHaveLength(depth);
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
