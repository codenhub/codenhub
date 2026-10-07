import { describe, expect, it } from "vitest";

import { unique } from "../checks/unique";
import { fail, pass } from "../core/result";
import type { AsyncValidator, Check } from "../core/types";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
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

  it("should read items by index, ignoring an iterator the array carries", () => {
    const tampered = Object.defineProperty([1, 2], Symbol.iterator, {
      value: function* () {
        yield* ["x", "y", "z"];
      },
    });
    expect(array(number(), { max: 2 })(tampered)).toEqual({ ok: true, value: [1, 2] });
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
      expect(issuesOf(array(string(), unique())(["a", "b", "a", "b", "a"])).map((issue) => issue.path)).toEqual([
        [2],
        [3],
        [4],
      ]);
      expect(issuesOf(array(string(), unique())(["a", "a"]))[0]).toEqual({
        code: "invalid_value",
        path: [1],
        params: { unique: true },
      });
    });

    it("should compare as a Set does, so NaN repeats NaN and -0 repeats 0", () => {
      expect(
        issuesOf(array(unknown(), unique() as Check<unknown[]>)([Number.NaN, Number.NaN, 0, -0])).map(
          ({ path }) => path,
        ),
      ).toEqual([[1], [3]]);
    });

    it("should let an exception from the key function propagate, as from any callback", () => {
      const broken = array(
        number(),
        unique(() => {
          throw new Error("no key");
        }),
      );
      expect(() => broken([1])).toThrow("no key");
    });

    it("should compare by the key a function returns", () => {
      const users = array(
        object({ id: number() }),
        unique((user) => user.id),
      );
      expect(users([{ id: 1 }, { id: 2 }]).ok).toBe(true);
      expect(users([{ id: 1 }, { id: 1 }]).ok).toBe(false);
    });

    it("should compare objects as themselves without a key, which the types forbid since each is new", () => {
      const byIdentity = unique() as unknown as Check<readonly unknown[]>;
      expect(array(object({ id: number() }), byIdentity)([{ id: 1 }, { id: 1 }]).ok).toBe(true);
    });

    it("should compare validated items, so clean-up is applied first", () => {
      expect(array(string({ trim: true }), unique())(["a", " a "]).ok).toBe(false);
    });

    it("should only check for repeats once every item is valid", () => {
      expect(codesOf(array(number(), unique())([1, 1, "x"]))).toEqual(["invalid_type"]);
    });

    it("should not check for repeats without the check", () => {
      expect(array(string())(["a", "a"]).ok).toBe(true);
    });

    it("should take a message for every repeat", () => {
      expect(issuesOf(array(string(), unique(undefined, "Twice"))(["a", "a"]))[0]?.message).toBe("Twice");
    });
  });

  describe("async items", () => {
    it("should validate items together and keep issues in index order", async () => {
      const names = array(isFree);
      const result = names(["ok", "taken", "fine", "taken"]);
      expect(isPending(result)).toBe(true);
      expect(issuesOf(await result).map((issue) => issue.path)).toEqual([[1], [3]]);
    });

    // Waits for text and answers at once for anything else, so one list holds items of both kinds.
    const calls: unknown[] = [];
    const mixed: AsyncValidator<unknown> = (input) => {
      calls.push(input);
      if (input === "throw") {
        throw new Error("a bug in the item");
      }
      const result = typeof input === "number" && input < 0 ? fail({ code: "negative" }) : pass(input);
      return typeof input === "string"
        ? input === "reject"
          ? Promise.reject(new Error("late"))
          : Promise.resolve(result)
        : result;
    };

    it("should keep values and issues in index order when only a later item waits", async () => {
      const result = array(mixed)([1, -2, "a", -4, 5]);
      expect(isPending(result)).toBe(true);
      expect(issuesOf(await result).map((issue) => issue.path)).toEqual([[1], [3]]);
      expect(valueOf(await array(mixed)([1, 2, "a", 4]))).toEqual([1, 2, "a", 4]);
    });

    it("should count the issues found before and after the first item that waits toward the limit", async () => {
      calls.length = 0;
      const bad = Array.from({ length: 1005 }, () => -1);
      const issues = issuesOf(await array(mixed)([-1, -1, "a", ...bad]));
      // Two before the one that waits, it, and the 998 after it that reach the limit.
      expect(calls).toHaveLength(1001);
      expect(issues).toHaveLength(1001);
      expect(issues.at(-1)).toMatchObject({ code: "too_big", path: [], params: { type: "issues" } });
    });

    it("should handle the rejection of an item that waits when a later one throws", async () => {
      expect(() => array(mixed)([1, "reject", "throw"])).toThrow("a bug in the item");
      // An unhandled rejection would fail the run here.
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    it("should answer at once for input that is not an array", () => {
      expect(isPending(array(isFree)("x"))).toBe(false);
    });

    it("should stay synchronous when the items are", () => {
      expect(isPending(numbers([1]))).toBe(false);
    });
  });
});
