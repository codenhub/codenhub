import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { oneOf } from "../primitives/one-of";
import { string } from "../primitives/string";
import { accepts, codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { record } from "./record";

describe("record", () => {
  const scores = record(string({ min: 1 }), number({ int: true }));

  it("should validate every key and value and return a new object", () => {
    const input = { ada: 3, alan: 5 };
    const output = valueOf(scores(input));
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it("should accept an empty object", () => {
    expect(scores({}).ok).toBe(true);
  });

  it("should reject non-objects, arrays and class instances", () => {
    expect(accepts(scores, null, [], "x", new Map(), new (class Widget {})())).toEqual(Array(5).fill(false));
    expect(issuesOf(scores([]))[0]?.params).toEqual({ expected: "object", received: "array" });
  });

  it("should report a bad value at its key", () => {
    expect(issuesOf(scores({ ada: 3, alan: "x" })).map((issue) => [issue.path, issue.code])).toEqual([
      [["alan"], "invalid_type"],
    ]);
  });

  it("should report a bad key as invalid_key at that key, holding the key's issues, and still check its value", () => {
    const shortKeys = record(string({ max: 2 }), number());
    expect(issuesOf(shortKeys({ abc: "x" }))).toEqual([
      {
        code: "invalid_key",
        path: ["abc"],
        params: { issues: [{ code: "too_big", path: [], params: { maximum: 2, type: "string" } }] },
      },
      { code: "invalid_type", path: ["abc"], params: { expected: "number", received: "string" } },
    ]);
  });

  it("should let keys be restricted to a fixed set, and make the type partial", () => {
    const perDay = record(oneOf(["mon", "tue"]), number());
    expect(valueOf(perDay({ mon: 1 }))).toEqual({ mon: 1 });
    expect(perDay({ wed: 1 }).ok).toBe(false);
    const output: Partial<Record<"mon" | "tue", number>> = valueOf(perDay({ mon: 1 }));
    expect(output.tue).toBeUndefined();
  });

  it("should treat __proto__ from JSON as data, never as a prototype write", () => {
    const parsed = JSON.parse('{"__proto__": 1, "a": 2}') as unknown;
    const output = valueOf(scores(parsed));
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.keys(output)).toEqual(["__proto__", "a"]);
  });

  it("should reject an object with a custom prototype, so inherited values are never read", () => {
    const inherited = Object.create({ a: 1 }) as Record<string, unknown>;
    expect(codesOf(scores(inherited))).toEqual(["invalid_type"]);
  });

  it("should never put the input in an issue", () => {
    expect(JSON.stringify(issuesOf(scores({ ada: "hunter2" })))).not.toContain("hunter2");
  });

  it("should be asynchronous when the key or value validator is", async () => {
    const taken = record(isFree, number());
    const result = taken({ ok: 1, taken: 2 });
    expect(isPending(result)).toBe(true);
    expect(codesOf(await result)).toEqual(["invalid_key"]);
    expect(isPending(scores({ a: 1 }))).toBe(false);
  });

  it("should report a key that the key validator makes equal to an earlier one, instead of dropping a value", () => {
    const lowered = record(string({ lowercase: true }), number());
    const result = lowered({ A: 1, a: 2 });
    expect(issuesOf(result)).toEqual([
      {
        code: "invalid_key",
        path: ["a"],
        params: { issues: [{ code: "invalid_value", path: [], params: { unique: true } }] },
      },
    ]);
    expect(valueOf(lowered({ A: 1, b: 2 }))).toEqual({ a: 1, b: 2 });
  });
});
