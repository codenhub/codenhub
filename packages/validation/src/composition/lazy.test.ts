import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import type { Validator } from "../core/types";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { array } from "./array";
import { lazy } from "./lazy";
import { object } from "./object";
import { optional } from "./optional";
import { pipe } from "./pipe";
import { transform } from "./transform";
import { union } from "./union";

interface Category {
  name: string;
  children: Category[];
}

describe("lazy", () => {
  const category: Validator<Category> = object({
    name: string(),
    children: array(lazy(() => category)),
  });

  it("should let a validator refer to itself for recursive data", () => {
    const tree = { name: "root", children: [{ name: "a", children: [{ name: "b", children: [] }] }] };
    expect(valueOf(category(tree))).toEqual(tree);
  });

  it("should report issues deep in the recursion at their full path", () => {
    const tree = { name: "root", children: [{ name: "a", children: [{ name: 1, children: [] }] }] };
    expect(issuesOf(category(tree)).map((issue) => issue.path)).toEqual([["children", 0, "children", 0, "name"]]);
  });

  it("should call the getter once, on first use", () => {
    let calls = 0;
    const counted = lazy(() => {
      calls += 1;
      return number();
    });
    expect(calls).toBe(0);
    counted(1);
    counted(2);
    expect(calls).toBe(1);
  });

  it("should work with asynchronous validators", async () => {
    const validator = lazy(() => isFree);
    expect(isPending(validator("a"))).toBe(true);
    expect(valueOf(await validator("a"))).toBe("a");
  });

  describe("depth", () => {
    const nested = (levels: number): Category => {
      let tree: Category = { name: "leaf", children: [] };
      for (let level = 0; level < levels; level += 1) {
        tree = { name: "node", children: [tree] };
      }
      return tree;
    };

    it("should accept input up to the limit and fail past it, at the path of the first value too deep", () => {
      const limited: Validator<Category> = object({
        name: string(),
        children: array(lazy(() => limited, { maxDepth: 3 })),
      });
      expect(limited(nested(3)).ok).toBe(true);
      const [issue] = issuesOf(limited(nested(5)));
      expect(issue).toEqual({
        code: "too_big",
        path: ["children", 0, "children", 0, "children", 0, "children", 0],
        params: { maximum: 3, type: "depth" },
      });
    });

    it("should fail input far deeper than the stack allows instead of throwing", () => {
      expect(issuesOf(category(nested(100_000))).map((issue) => issue.code)).toEqual(["too_big"]);
    });

    it("should fail a cyclic object instead of following it forever", () => {
      const cycle: { name: string; children: unknown[] } = { name: "loop", children: [] };
      cycle.children.push(cycle);
      expect(issuesOf(category(cycle)).map((issue) => issue.code)).toEqual(["too_big"]);
    });

    it("should stay under the stack with the default limit when each level adds several validators", () => {
      const heavy: Validator<unknown> = object({
        next: optional(
          union([
            pipe(
              lazy(
                () => heavy,
                check(() => true),
              ),
              // Typed as the object `heavy` produces, since a function returning `unknown` may be a promise.
              transform(unknown(), (value) => value as object),
            ),
            string(),
          ]),
        ),
      });
      let input: unknown = {};
      for (let level = 0; level < 500; level += 1) {
        input = { next: input };
      }
      expect(issuesOf(heavy(input)).map((issue) => issue.code)).toEqual(["invalid_union"]);
    });

    it("should count every lazy validator, so two that call each other share one limit", () => {
      const ping: Validator<unknown> = optional(object({ next: lazy(() => pong, { maxDepth: 4 }) }));
      const pong: Validator<unknown> = optional(object({ next: lazy(() => ping, { maxDepth: 4 }) }));
      let input: unknown = {};
      for (let level = 0; level < 10; level += 1) {
        input = { next: input };
      }
      expect(issuesOf(ping(input)).map((issue) => issue.params)).toEqual([{ maximum: 4, type: "depth" }]);
    });

    it("should close a level when the validator throws, so a later call is not counted as deeper", () => {
      const broken = lazy(
        () => {
          throw new Error("boom");
        },
        { maxDepth: 1 },
      );
      expect(() => broken(1)).toThrow("boom");
      expect(() => broken(1)).toThrow("boom");
    });

    it("should measure depth on the stack, not across an await", async () => {
      const slow: Validator<Category> = object({ name: string(), children: array(lazy(() => slow, { maxDepth: 2 })) });
      const late = lazy(() => isFree, { maxDepth: 1 });
      const results = await Promise.all([late("a"), late("b"), late("c")]);
      expect(results.map((result) => result.ok)).toEqual([true, true, true]);
      expect(slow(nested(1)).ok).toBe(true);
    });

    it("should reject a limit that is not a positive integer", () => {
      expect(() => lazy(() => number(), { maxDepth: 0 })).toThrow(RangeError);
      expect(() => lazy(() => number(), { maxDepth: 1.5 })).toThrow(RangeError);
      expect(() => lazy(() => number(), { maxDepth: Number.NaN })).toThrow(RangeError);
    });

    it("should reject a limit that is not a number as a TypeError", () => {
      expect(() => lazy(() => number(), { maxDepth: "5" as never })).toThrow(
        new TypeError("maxDepth must be a number, received string"),
      );
    });
  });
});

describe("lazy, given a getter that returns null", () => {
  it("should throw a TypeError naming null on first use", () => {
    expect(() => lazy(() => null as never)(1)).toThrow("getter() must return a function, received null");
  });
});
