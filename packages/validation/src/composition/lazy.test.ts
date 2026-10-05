import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { format } from "../builders/format";
import { guard } from "../builders/guard";
import type { AsyncValidator, Validator } from "../core/types";
import { boolean } from "../primitives/boolean";
import { literal } from "../primitives/literal";
import { never } from "../primitives/never";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { array } from "./array";
import { fallback } from "./fallback";
import { intersection } from "./intersection";
import { json } from "./json";
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

    it("should stay under the stack with the default limit however many options a union tries first", () => {
      // Each option that failed once stayed on the stack while the next ran, so twenty before the recursive
      // one overflowed it inside the default limit, on 3 kB of valid input.
      const others = Array.from({ length: 200 }, (_, index) => object({ type: literal(`t${index}`) }));
      const block: Validator<unknown> = union([
        object({ type: literal("none") }),
        ...others,
        object({ type: literal("list"), items: array(lazy(() => block)) }),
      ]);
      let input: unknown = { type: "list", items: [] };
      for (let level = 0; level < 126; level += 1) {
        input = { type: "list", items: [input] };
      }
      expect(block(input).ok).toBe(true);
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
    it("should not count a primitive that ends the recursion, so a long flat list passes", () => {
      const value: Validator<unknown> = union([number(), string(), array(lazy(() => value))]);
      expect(value(Array.from({ length: 10_001 }, () => 1)).ok).toBe(true);
    });

    it("should count a primitive the recursion goes on through, as text that holds the next level", () => {
      const text: Validator<unknown> = union([literal("end"), json(lazy(() => text, { maxCalls: 3 }))]);
      let input = "end";
      for (let level = 0; level < 6; level += 1) {
        input = JSON.stringify(input);
      }
      const [issue] = issuesOf(json(text)(input));
      expect(JSON.stringify(issue)).toContain('"type":"calls"');
    });

    it("should count a primitive whose result is pending", async () => {
      const slow = string(check(async () => true));
      const list = array(lazy(() => slow, { maxCalls: 2 }));
      expect(issuesOf(await list(["a", "b", "c"]))).toEqual([
        { code: "too_big", path: [2], params: { maximum: 2, type: "calls" } },
      ]);
    });

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

    it("should hold each lazy validator to its own limit, whatever the limits of the others it meets", () => {
      const linked: Validator<Link> = object({ next: optional(lazy(() => linked)) });
      expect(lazy(() => linked, { maxCalls: 3 })(chain(5)).ok).toBe(true);
      const tight: Validator<Link> = object({ next: optional(lazy(() => tight, { maxCalls: 3 })) });
      expect(issuesOf(lazy(() => tight, { maxCalls: 10 })(chain(4)))).toEqual([
        { code: "too_big", path: ["next", "next", "next", "next"], params: { maximum: 3, type: "calls" } },
      ]);
    });

    it("should keep a raised limit when another lazy validator with a lower one is reached first", () => {
      interface Node {
        kids: Node[];
      }
      const node: Validator<Node> = object({ kids: array(lazy(() => node, { maxCalls: 20_000 })) });
      const tag: Validator<Link> = object({ next: optional(lazy(() => tag, { maxCalls: 3 })) });
      const document = object({ meta: tag, body: node });
      const body = { kids: Array.from({ length: 15_000 }, () => ({ kids: [] })) };
      expect(document({ meta: chain(1), body }).ok).toBe(true);
    });

    it("should count each outermost call afresh, so calls made one after another do not add up", () => {
      const linked: Validator<Link> = object({ next: optional(lazy(() => linked, { maxCalls: 3 })) });
      expect([linked(chain(3)).ok, linked(chain(3)).ok, linked(chain(3)).ok]).toEqual([true, true, true]);
    });

    /** A recursive union of objects, whose work doubles with each level unless it is shared, and a count of its lazy calls. */
    const doubling = (copy = false): { node: Validator<unknown>; calls: () => number } => {
      let calls = 0;
      // Counts every call a lazy validator lets through to the union.
      const counted: Validator<unknown> = (input) => {
        calls += 1;
        return node(input);
      };
      // A copy is a new value each time, so no result can be shared for it.
      const kid = (): Validator<unknown> =>
        copy
          ? pipe(
              transform(unknown(), (value) => ({ ...(value as object) })),
              lazy(() => counted),
            )
          : lazy(() => counted);
      const node: Validator<unknown> = union([
        object({ type: literal("a"), kids: array(kid()) }),
        object({ type: literal("b"), kids: array(kid()) }),
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

    it("should validate a value once for each lazy validator and path, so a recursive union does linear work", () => {
      const { node, calls } = doubling();
      // 2^60 calls if every option validated the children again; two per level once each is shared.
      expect(lazy(() => node)(deep(60)).ok).toBe(true);
      expect(calls()).toBeLessThanOrEqual(2 * 61);
    });

    it("should report a failure of a recursive union in issues whose serialized size grows with the input", () => {
      const { node } = doubling();
      const failing = (levels: number): unknown => {
        let input: unknown = { type: "c", kids: [] };
        for (let level = 0; level < levels; level += 1) {
          input = { type: "a", kids: [input] };
        }
        return input;
      };
      // Each option holds the children's failure, shared, so serializing it took 2^levels copies: 22 MB at 16 levels.
      const sizes = [8, 16].map((levels) => JSON.stringify(lazy(() => node)(failing(levels))).length);
      expect(sizes[0]).toBeLessThan(10_000);
      expect(sizes[1]).toBe(sizes[0]);
    });

    it("should share results across the items of a validation, wherever its root is", () => {
      const { node, calls } = doubling();
      const items = Array.from({ length: 50 }, () => deep(30));
      expect(array(node)(items).ok).toBe(true);
      expect(calls()).toBeLessThanOrEqual(50 * 2 * 31);
    });

    it("should report a value reached at two paths at each of them", () => {
      const point = lazy(() => object({ x: number() }));
      const shared = { x: "1" };
      expect(
        issuesOf(object({ from: point, to: point })({ from: shared, to: shared })).map(({ path }) => path),
      ).toEqual([
        ["from", "x"],
        ["to", "x"],
      ]);
    });

    // Up to 10,000 calls for each of the two lazy validators, which a loaded machine may take a while over.
    it(
      "should stop a recursive union whose work doubles with each level and cannot be shared, long before it would finish",
      { timeout: 60_000 },
      () => {
        const { node, calls } = doubling(true);
        expect(lazy(() => node)(deep(60)).ok).toBe(false);
        expect(calls()).toBeGreaterThan(0);
        expect(calls()).toBeLessThanOrEqual(20_000);
      },
    );

    it("should hold a schema built anew at every level by its getter to the limit of the lazy that built it", () => {
      // Each level's getter builds a new union with new lazy validators, which a count per lazy would
      // give a fresh limit at every level: 29 seconds at 18 levels, and the heap exhausted at 22.
      const node = (): Validator<unknown> =>
        union([
          object({ type: literal("a"), kids: array(lazy(node)) }),
          object({ type: literal("a"), kids: array(lazy(node)) }),
        ]) as Validator<unknown>;
      let input: unknown = { type: "z", kids: [] };
      for (let level = 0; level < 40; level += 1) {
        input = { type: "a", kids: [input] };
      }
      const result = node()(input);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).toContain('"type":"calls"');
    });

    it("should keep the count of a lazy made outside a getter its own, however many are made", () => {
      // One call each: a count shared between the two would be spent by the first.
      const fresh = (): Validator<string> => lazy(() => string(), { maxCalls: 1 });
      expect(object({ a: fresh(), b: fresh() })({ a: "x", b: "y" }).ok).toBe(true);
    });

    it("should keep separate counts for validations that run at the same time, and fresh ones after a rejection", async () => {
      interface Named {
        next?: Named;
        name?: string;
      }
      const linked: AsyncValidator<Named> = object({
        next: optional(lazy(() => linked, { maxCalls: 5 })),
        name: optional(string(check(async (text: string) => (await isFree(text)).ok))),
      });
      const named = (links: number): Named => ({ ...chain(links), name: "free" });
      const results = await Promise.all([3, 3, 10, 3].map((links) => linked(named(links))));
      expect(results.map(({ ok }) => ok)).toEqual([true, true, false, true]);
      const failing = object({
        next: optional(lazy(() => linked, { maxCalls: 5 })),
        name: string(check(async () => Promise.reject(new Error("lookup failed")))),
      });
      await expect(failing({ next: chain(4), name: "x" })).rejects.toThrow("lookup failed");
      expect((await linked(named(5))).ok).toBe(true);
    });

    it("should count a validation made from a callback on its own, apart from the one running the callback", async () => {
      // One call is allowed, and the outer validation spends it before any callback runs.
      const limited = lazy(() => string(), { maxCalls: 1 });
      const fromCallback = (): boolean => limited("x").ok;
      const outer = (inside: Validator<unknown>): Validator<unknown> => object({ first: limited, second: inside });
      const callbacks: [string, Validator<unknown>, unknown, unknown][] = [
        ["check", string(check(fromCallback)), "x", "x"],
        ["transform", transform(string(), fromCallback), "x", true],
        ["guard", guard("thing", (input): input is unknown => fromCallback() && input !== null)(), "x", "x"],
        ["format", format("thing", fromCallback)(), "x", "x"],
        ["optional default", optional(boolean(), fromCallback), undefined, true],
        ["fallback", fallback(boolean(), fromCallback), "x", true],
        ["lazy getter", lazy(() => (fromCallback() ? string() : never())), "x", "x"],
      ];
      for (const [name, inside, input, expected] of callbacks) {
        const result = outer(inside)({ first: "x", second: input });
        expect([name, result.ok && result.value]).toEqual([name, { first: "x", second: expected }]);
      }
      // An asynchronous check runs on its own after an await too.
      const later = string(check(async (value: string) => (await isFree(value)).ok && fromCallback()));
      expect((await object({ first: limited, second: later })({ first: "x", second: "x" })).ok).toBe(true);
    });

    it("should count each validation afresh, even one made by a hand-written validator", () => {
      const linked: Validator<Link> = object({ next: optional(lazy(() => linked, { maxCalls: 3 })) });
      const twice: Validator<unknown> = (input) => {
        const first = linked(input);
        // A copy, so the second call is new work rather than a result already found.
        return first.ok ? linked(structuredClone(input)) : first;
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
      expect((await node(input)).ok).toBe(true);
      // 2^30 leaf checks without a limit that lasts across awaits.
      expect(calls).toBeLessThan(1_000);
    });

    it("should report a failure of an asynchronous recursive union in issues nested at most two unions deep", async () => {
      const node: Validator<unknown> = union([
        pipe(
          transform(unknown(), async (value) => value),
          object({ next: lazy(() => node) }),
        ),
        object({ end: literal(1) }),
      ]) as Validator<unknown>;
      let input: unknown = { end: 2 };
      for (let level = 0; level < 2_000; level += 1) {
        input = { next: input };
      }
      const result = await node(input);
      expect(result.ok).toBe(false);
      // Nested once per level, 2,000 unions deep, the issues overflowed the stack of a serializer.
      expect(JSON.stringify(result).length).toBeLessThan(2_000);
      expect(() => structuredClone(result)).not.toThrow();
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

  it("should report a shared object at each path it is reached at, under parents with the same last key", () => {
    type Node = { k?: Node; v?: number };
    const node: Validator<Node> = lazy(() => object({ k: optional(node), v: optional(number()) }));
    const shared = { v: "x" };
    const issues = issuesOf(object({ a: node, b: node })({ a: { k: shared }, b: { k: shared } }));
    expect(issues.map((found) => found.path)).toEqual([
      ["a", "k", "v"],
      ["b", "k", "v"],
    ]);
  });

  it("should validate an object once when two options of a union reach it at the same place", () => {
    let calls = 0;
    const counted: Validator<{ n: number }> = (input) => {
      calls += 1;
      return object({ n: number() })(input);
    };
    const node = lazy(() => counted);
    const either = union([object({ child: node, tag: literal("a") }), object({ child: node, tag: literal("b") })]);
    expect(valueOf(either({ child: { n: 1 }, tag: "b" }))).toEqual({ child: { n: 1 }, tag: "b" });
    expect(calls).toBe(1);
    // Both sides of an intersection are given the very place they are at, and it is found at once.
    expect(valueOf(object({ wrap: intersection(node, node) })({ wrap: { n: 1 } }))).toEqual({ wrap: { n: 1 } });
    expect(calls).toBe(2);
  });
});
