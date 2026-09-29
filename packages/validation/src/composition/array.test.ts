import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { accepts, codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { array } from "./array";
import { object } from "./object";

describe("array", () => {
  const numbers = array(number({ int: true }));

  it("should validate every item and return a new array", () => {
    const input = [1, 2, 3];
    const output = valueOf(numbers(input));
    expect(output).toEqual([1, 2, 3]);
    expect(output).not.toBe(input);
  });

  it("should accept an empty array", () => {
    expect(numbers([]).ok).toBe(true);
  });

  it("should reject non-arrays, naming the received type", () => {
    expect(accepts(numbers, null, undefined, {}, "12", new Set([1]), { length: 1 })).toEqual(Array(6).fill(false));
    expect(issuesOf(numbers({}))[0]?.params).toEqual({ expected: "array", received: "object" });
  });

  it("should report every bad item at its index", () => {
    expect(issuesOf(numbers([1, "a", 3, 1.5])).map((issue) => [issue.path, issue.code])).toEqual([
      [[1], "invalid_type"],
      [[3], "invalid_value"],
    ]);
  });

  it("should nest paths through arrays of objects", () => {
    const users = array(object({ name: string({ min: 2 }) }));
    expect(issuesOf(users([{ name: "Ada" }, { name: "A" }])).map((issue) => issue.path)).toEqual([[1, "name"]]);
  });

  it("should treat sparse array holes as undefined", () => {
    const sparse: unknown[] = [1];
    sparse[2] = 3;
    expect(numbers(sparse).ok).toBe(false);
  });

  describe("size", () => {
    it("should treat min and max as inclusive and length as exact", () => {
      expect(accepts(array(string(), { min: 2 }), [], ["a"], ["a", "b"])).toEqual([false, false, true]);
      expect(accepts(array(string(), { max: 1 }), [], ["a"], ["a", "b"])).toEqual([true, true, false]);
      expect(accepts(array(string(), { length: 2 }), ["a"], ["a", "b"], ["a", "b", "c"])).toEqual([false, true, false]);
    });

    it("should carry the limit and type in params", () => {
      expect(issuesOf(array(string(), { min: 2 })(["a"]))).toEqual([
        { code: "too_small", path: [], params: { minimum: 2, type: "array" } },
      ]);
    });

    it("should report a wrong size without validating the items", () => {
      let calls = 0;
      const counted = array(
        (input) => {
          calls += 1;
          return { ok: true, value: input };
        },
        { max: 1 },
      );
      expect(codesOf(counted([1, 2, 3]))).toEqual(["too_big"]);
      expect(calls).toBe(0);
    });

    it("should reject a size that is not a non-negative integer when the validator is created", () => {
      for (const options of [{ min: -1 }, { max: 1.5 }, { length: Number.NaN }]) {
        expect(() => array(string(), options)).toThrow(RangeError);
      }
    });
  });

  describe("unique", () => {
    it("should reject repeats at their own index, keeping the first", () => {
      expect(issuesOf(array(string(), { unique: true })(["a", "b", "a", "b", "a"])).map((issue) => issue.path)).toEqual(
        [[2], [3], [4]],
      );
      expect(issuesOf(array(string(), { unique: true })(["a", "a"]))[0]).toEqual({
        code: "invalid_value",
        path: [1],
        params: { unique: true },
      });
    });

    it("should compare by the key a function returns", () => {
      const users = array(object({ id: number() }), { unique: (user) => user.id });
      expect(users([{ id: 1 }, { id: 2 }]).ok).toBe(true);
      expect(users([{ id: 1 }, { id: 1 }]).ok).toBe(false);
      expect(array(object({ id: number() }), { unique: true })([{ id: 1 }, { id: 1 }]).ok).toBe(true);
    });

    it("should compare validated items, so clean-up is applied first", () => {
      expect(array(string({ trim: true }), { unique: true })(["a", " a "]).ok).toBe(false);
    });

    it("should only check for repeats once every item is valid", () => {
      expect(codesOf(array(number(), { unique: true })([1, 1, "x"]))).toEqual(["invalid_type"]);
    });

    it("should not check for repeats when it is false or absent", () => {
      expect(array(string(), { unique: false })(["a", "a"]).ok).toBe(true);
    });
  });

  describe("async items", () => {
    it("should validate items together and keep issues in index order", async () => {
      const names = array(isFree);
      const result = names(["ok", "taken", "fine", "taken"]);
      expect(isPending(result)).toBe(true);
      expect(issuesOf(await result).map((issue) => issue.path)).toEqual([[1], [3]]);
    });

    it("should answer at once for input that is not an array", () => {
      expect(isPending(array(isFree)("x"))).toBe(false);
    });

    it("should stay synchronous when the items are", () => {
      expect(isPending(numbers([1]))).toBe(false);
    });
  });
});
