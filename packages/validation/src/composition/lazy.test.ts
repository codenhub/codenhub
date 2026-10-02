import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import type { Validator } from "../core/types";
import { literal } from "../primitives/literal";
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

  describe("calls", () => {
    interface Link {
      next?: Link;
    }
    const chain = (links: number): Link => {
      let link: Link = {};
      for (let index = 1; index < links; index += 1) {
        link = { next: link };
      }
      return { next: link };
    };

    it("should accept a run of up to the limit of lazy calls and fail past it, at the path of the call", () => {
      const linked: Validator<Link> = object({ next: optional(lazy(() => linked, { maxCalls: 3 })) });
      expect(linked(chain(3)).ok).toBe(true);
      expect(issuesOf(linked(chain(4)))).toEqual([
        { code: "too_big", path: ["next", "next", "next", "next"], params: { maximum: 3, type: "calls" } },
      ]);
    });

    it("should hold the whole run to the limit of the outermost lazy call, lower or higher than the inner ones", () => {
      const linked: Validator<Link> = object({ next: optional(lazy(() => linked)) });
      expect(issuesOf(lazy(() => linked, { maxCalls: 3 })(chain(3)))).toEqual([
        { code: "too_big", path: ["next", "next", "next"], params: { maximum: 3, type: "calls" } },
      ]);
      const tight: Validator<Link> = object({ next: optional(lazy(() => tight, { maxCalls: 3 })) });
      expect(lazy(() => tight, { maxCalls: 10 })(chain(5)).ok).toBe(true);
    });

    it("should count each outermost call afresh, so calls made one after another do not add up", () => {
      const linked: Validator<Link> = object({ next: optional(lazy(() => linked, { maxCalls: 3 })) });
      expect([linked(chain(3)).ok, linked(chain(3)).ok, linked(chain(3)).ok]).toEqual([true, true, true]);
    });

    it("should count the calls a union makes for options that fail, which is where the work multiplies", () => {
      const node: Validator<unknown> = union([
        object({ type: literal("a"), kids: array(lazy(() => node, { maxCalls: 10 })) }),
        object({ type: literal("b"), kids: array(lazy(() => node, { maxCalls: 10 })) }),
      ]);
      let input: unknown = { type: "b", kids: [] };
      for (let level = 0; level < 5; level += 1) {
        input = { type: "b", kids: [input] };
      }
      expect(node(input).ok).toBe(false);
    });

    /** A recursive union of objects, whose work doubles with each level, and a count of its lazy calls. */
    const doubling = (): { node: Validator<unknown>; calls: () => number } => {
      let calls = 0;
      // Counts every call a lazy validator lets through to the union.
      const counted: Validator<unknown> = (input) => {
        calls += 1;
        return node(input);
      };
      const node: Validator<unknown> = union([
        object({ type: literal("a"), kids: array(lazy(() => counted)) }),
        object({ type: literal("b"), kids: array(lazy(() => counted)) }),
      ]);
      return { node, calls: () => calls };
    };
    const deep = (levels: number): unknown => {
      let input: unknown = { type: "b", kids: [] };
      for (let level = 0; level < levels; level += 1) {
        input = { type: "b", kids: [input] };
      }
      return input;
    };

    // Up to 10,000 calls, which a loaded machine may take a while over.
    it(
      "should stop a recursive union whose work doubles with each level by default, long before it would finish",
      { timeout: 60_000 },
      () => {
        const { node, calls } = doubling();
        // 2^60 calls without the limit; at most 10,000 with the root in one lazy run.
        expect(lazy(() => node)(deep(60)).ok).toBe(false);
        expect(calls()).toBeGreaterThan(0);
        expect(calls()).toBeLessThanOrEqual(10_000);
      },
    );

    it(
      "should hold a whole validation that fans out to one limit when its root is wrapped in lazy",
      { timeout: 60_000 },
      () => {
        const { node, calls } = doubling();
        const items = Array.from({ length: 5 }, () => deep(30));
        expect(lazy(() => array(node))(items).ok).toBe(false);
        expect(calls()).toBeLessThanOrEqual(10_000);
      },
    );

    it("should hold a whole validation to one limit when its root is not a lazy validator", { timeout: 60_000 }, () => {
      const { node, calls } = doubling();
      // Each item used to start a count of its own, so the work, and the issues kept, grew with the items.
      const items = Array.from({ length: 50 }, () => deep(30));
      expect(array(node)(items).ok).toBe(false);
      expect(calls()).toBeLessThanOrEqual(10_000);
    });

    it("should count each validation afresh, even one made by a hand-written validator", () => {
      const linked: Validator<Link> = object({ next: optional(lazy(() => linked, { maxCalls: 3 })) });
      const twice: Validator<unknown> = (input) => {
        const first = linked(input);
        return first.ok ? linked(input) : first;
      };
      // Inside one validation, the two calls share its count.
      expect(object({ a: twice })({ a: chain(2) }).ok).toBe(false);
      expect([twice(chain(1)).ok, twice(chain(1)).ok]).toEqual([true, true]);
    });

    it("should keep counting after an await, so a validation that waits is held to the limit too", async () => {
      const linked: Validator<Link> = object({ next: optional(lazy(() => linked, { maxCalls: 3 })) });
      const later = pipe(
        isFree,
        transform(string(), () => chain(2)),
        linked,
      );
      // Two calls before the await and two after it make four, one past the limit.
      const both = object({ now: linked, later });
      expect((await both({ now: chain(2), later: "free" })).ok).toBe(false);
      expect((await both({ now: chain(1), later: "free" })).ok).toBe(true);
    });

    it("should stop a recursive union with an asynchronous rule, whose work doubles with each level", async () => {
      let calls = 0;
      const free = check(async (text: string) => {
        calls += 1;
        return (await isFree(text)).ok;
      });
      const node: Validator<unknown> = union([
        object({ type: literal("a"), next: lazy(() => node, { maxCalls: 50 }) }),
        object({ type: literal("b"), next: lazy(() => node, { maxCalls: 50 }) }),
        string(free),
      ]) as Validator<unknown>;
      let input: unknown = "leaf";
      for (let level = 0; level < 30; level += 1) {
        input = { type: "b", next: input };
      }
      await node(input);
      // 2^30 leaf checks without a limit that lasts across awaits.
      expect(calls).toBeLessThan(1_000);
    });

    it("should allow 10,000 calls in one validation by default, a tree of 10,000 nodes", () => {
      interface Node {
        kids: Node[];
      }
      const node: Validator<Node> = object({ kids: array(lazy(() => node)) });
      const tree = (nodes: number): Node => ({ kids: Array.from({ length: nodes - 1 }, () => ({ kids: [] })) });
      expect(node(tree(10_001)).ok).toBe(true);
      expect(issuesOf(node(tree(10_002)))[0]?.params).toEqual({ maximum: 10_000, type: "calls" });
    });

    it("should reject a limit that is not a positive integer, or not a number", () => {
      expect(() => lazy(() => number(), { maxCalls: 0 })).toThrow(RangeError);
      expect(() => lazy(() => number(), { maxCalls: 1.5 })).toThrow(RangeError);
      expect(() => lazy(() => number(), { maxCalls: "5" as never })).toThrow(
        new TypeError("maxCalls must be a number, received string"),
      );
    });
  });
});

describe("lazy, given a getter that returns null", () => {
  it("should throw a TypeError naming null on first use", () => {
    expect(() => lazy(() => null as never)(1)).toThrow("getter() must return a function, received null");
  });
});
