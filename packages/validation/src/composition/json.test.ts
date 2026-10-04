import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { oneOf } from "../primitives/one-of";
import { accepts, codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { json } from "./json";
import { object } from "./object";

describe("json", () => {
  it("should parse text nested far deeper than any stack without throwing", () => {
    const levels = 1_000_000;
    expect(json()(`${"[".repeat(levels)}${"]".repeat(levels)}`).ok).toBe(true);
  });

  it("should parse text holding JSON and produce unknown without a validator", () => {
    expect(valueOf(json()('{"a":[1,2]}'))).toEqual({ a: [1, 2] });
    expect(valueOf(json()("42"))).toBe(42);
    expect(valueOf(json()("null"))).toBeNull();
  });

  it("should reject text that is not JSON with invalid_format naming json, never echoing the text", () => {
    expect(issuesOf(json()("{oops"))).toEqual([{ code: "invalid_format", path: [], params: { format: "json" } }]);
    expect(JSON.stringify(issuesOf(json()("hunter2")))).not.toContain("hunter2");
  });

  it("should reject anything that is not a string, including already parsed values", () => {
    expect(accepts(json(), {}, 1, null, undefined, [])).toEqual(Array(5).fill(false));
    expect(codesOf(json()({}))).toEqual(["invalid_type"]);
  });

  it("should validate the parsed value with a validator, and give its type", () => {
    const settings = json(object({ theme: oneOf(["light", "dark"]) }));
    const value: { theme: "light" | "dark" } = valueOf(settings('{"theme":"dark"}'));
    expect(value.theme).toBe("dark");
    expect(issuesOf(settings('{"theme":"blue"}')).map((issue) => [issue.path, issue.code])).toEqual([
      [["theme"], "invalid_value"],
    ]);
  });

  it("should treat __proto__ in the text as data", () => {
    const output = valueOf(json()('{"__proto__": {"admin": true}}')) as object;
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
  });

  it("should be asynchronous when the validator is", async () => {
    const validator = json(isFree);
    expect(isPending(validator('"a"'))).toBe(true);
    expect(valueOf(await validator('"a"'))).toBe("a");
    expect(isPending(json(number())("1"))).toBe(false);
  });
});
