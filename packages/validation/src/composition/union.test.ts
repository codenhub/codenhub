import { describe, expect, it } from "vitest";

import { fail, pass } from "../core/result";
import type { Validator } from "../core/types";
import { literal } from "../primitives/literal";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { accepts, codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { object } from "./object";
import { union } from "./union";

describe("union", () => {
  const id = union([string({ min: 1 }), number({ int: true })]);

  it("should accept a value that passes any option and return what that option produced", () => {
    expect(valueOf(id("a1"))).toBe("a1");
    expect(valueOf(id(7))).toBe(7);
  });

  it("should read the options once, when the validator is created", () => {
    const options: [Validator<unknown>, ...Validator<unknown>[]] = [number()];
    const either = union(options);
    options[0] = string();
    options.push(string());
    expect(accepts(either, 1, "a")).toEqual([true, false]);
  });

  it("should reject a value no option accepts, with one invalid_union issue at the value", () => {
    expect(codesOf(id(true))).toEqual(["invalid_union"]);
    expect(issuesOf(id(true))[0]?.path).toEqual([]);
  });

  it("should list, per option in order, the issues that option found", () => {
    const [issue] = issuesOf(id(1.5));
    const found = issue?.params?.issues as { code: string }[][];
    expect(found.map((issues) => issues.map((entry) => entry.code))).toEqual([["invalid_type"], ["invalid_value"]]);
  });

  it("should try options in order and stop at the first that accepts", () => {
    const calls: string[] = [];
    const record =
      (name: string, accepted: boolean): Validator<string> =>
      () => {
        calls.push(name);
        return accepted ? pass(name) : fail({ code: "no" });
      };
    expect(valueOf(union([record("a", false), record("b", true), record("c", true)])(1))).toBe("b");
    expect(calls).toEqual(["a", "b"]);
  });

  it("should nest under the parent's path when inside an object", () => {
    const form = object({ id });
    expect(issuesOf(form({ id: true }))[0]?.path).toEqual(["id"]);
  });

  it("should work with a single option", () => {
    expect(accepts(union([literal("a")]), "a", "b")).toEqual([true, false]);
  });

  it("should give the union of the option types", () => {
    const value: string | number = valueOf(id("a"));
    expect(value).toBe("a");
  });

  it("should never put the input in an issue", () => {
    expect(JSON.stringify(issuesOf(id("")))).not.toContain("hunter2");
    expect(JSON.stringify(issuesOf(union([literal("a")])("hunter2")))).not.toContain("hunter2");
  });

  it("should be asynchronous when an option is, and still try in order", async () => {
    const mixed = union([number(), isFree]);
    expect(isPending(mixed(1))).toBe(false);
    const result = mixed("taken");
    expect(isPending(result)).toBe(true);
    expect(codesOf(await result)).toEqual(["invalid_union"]);
    expect(valueOf(await mixed("free"))).toBe("free");
  });
});
