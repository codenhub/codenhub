import { describe, expect, it, vi } from "vitest";

import { coerceDate } from "../coercion/coerce-date";
import { date } from "../primitives/date";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { array } from "./array";
import { intersection } from "./intersection";
import { json } from "./json";
import { map } from "./map";
import { object } from "./object";
import { set } from "./set";
import { transform } from "./transform";

describe("intersection", () => {
  it("should report a revoked proxy one side passed through as a conflict, not throw", () => {
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    expect(
      codesOf(
        intersection(
          unknown(),
          transform(unknown(), () => ({})),
        )(proxy),
      ),
    ).toEqual(["invalid_intersection"]);
  });

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
    const upper = map(string(), string({ case: "upper" }));
    expect(issuesOf(intersection(trimmed, upper)(new Map([["k", " a "]])))).toEqual([
      { code: "invalid_intersection", path: ["k"] },
    ]);
  });

  it("should merge two maps whose keys are objects entry by entry, keeping one entry per input entry", () => {
    const keyed = map(object({ id: number() }), number());
    const merged = valueOf(intersection(keyed, keyed)(new Map([[{ id: 1 }, 2]])));
    expect([...merged]).toEqual([[{ id: 1 }, 2]]);
    const shifted = map(
      transform(object({ id: number() }), ({ id }) => ({ id: id + 1 })),
      number(),
    );
    expect(issuesOf(intersection(keyed, shifted)(new Map([[{ id: 1 }, 2]])))).toEqual([
      { code: "invalid_intersection", path: [0, "id"] },
    ]);
  });

  it("should report maps of different sizes, which cannot hold the same entries", () => {
    const grown = transform(map(string(), number()), (entries) => new Map([...entries, ["extra", 0]]));
    expect(codesOf(intersection(map(string(), number()), grown)(new Map([["a", 1]])))).toEqual([
      "invalid_intersection",
    ]);
  });

  it("should accept two sets that hold the same values, and report sets that differ at the position", () => {
    const ids = set(number());
    expect(valueOf(intersection(ids, set(number({ int: true })))(new Set([1, 2])))).toEqual(new Set([1, 2]));
    const shifted = transform(set(number()), (values) => new Set([...values].map((value) => value + 1)));
    expect(issuesOf(intersection(ids, shifted)(new Set([1])))).toEqual([{ code: "invalid_intersection", path: [0] }]);
  });

  it("should merge two sets of objects value by value", () => {
    const points = set(object({ x: number() }));
    const merged = valueOf(
      intersection(points, set(object({ x: number({ int: true }) })))(new Set([{ x: 1 }, { x: 2 }])),
    );
    expect([...merged]).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it("should treat 0 and -0 as the same value and produce 0, whichever side holds which", () => {
    const clamped = number({ clamp: { min: 0, max: 10 } }); // clamps -0 to 0
    expect(Object.is(valueOf(intersection(clamped, number())(-0)), 0)).toBe(true);
    expect(Object.is(valueOf(intersection(number(), clamped)(-0)), 0)).toBe(true);
    expect(Object.is(valueOf(intersection(number(), number())(-0)), -0)).toBe(true);
  });

  it("should treat dates holding the same moment as equal", () => {
    const window = intersection(coerceDate({ min: new Date(0) }), coerceDate({ max: new Date(2e12) }));
    const value = valueOf(window("2026-01-01"));
    expect(value).toEqual(new Date("2026-01-01"));
    expect(valueOf(intersection(date(), date())(value))).toBe(value);
  });

  it("should report outputs that cannot be merged as invalid_intersection at the conflict, not keep one", () => {
    expect(issuesOf(intersection(string({ trim: true }), string({ case: "upper" }))("  ab "))).toEqual([
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

  it("should merge two different cyclic outputs into one cyclic output instead of walking forever", () => {
    const cyclic = (): Record<string, unknown> => {
      const node: Record<string, unknown> = { name: "a" };
      node["self"] = node;
      return node;
    };
    const merged = valueOf(intersection(transform(number(), cyclic), transform(number(), cyclic))(1)) as Record<
      string,
      unknown
    >;
    expect(merged["name"]).toBe("a");
    expect(merged["self"]).toBe(merged);
  });

  // Large on purpose, so a loaded machine may take a while over it; it checks what happens, not how fast.
  it("should merge outputs nested far deeper than the stack allows instead of throwing", { timeout: 30_000 }, () => {
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

describe("intersection, merging many values", () => {
  it("should ask whether a value is a date, map or set only of a pair that is no array or plain object", () => {
    // Each ask of a value that is not one throws inside, which cost ten times the validation itself.
    const getTime = vi.spyOn(Date.prototype, "getTime");
    try {
      const items = Array.from({ length: 50 }, (_, index) => ({ id: index, tags: ["a"] }));
      const both = intersection(json(), json());
      expect(both(JSON.stringify(items)).ok).toBe(true);
      expect(codesOf(both(JSON.stringify([1, 2])) as never)).toEqual([]);
      expect(getTime).not.toHaveBeenCalled();
    } finally {
      getTime.mockRestore();
    }
  });

  it("should report two different primitives as a conflict without asking what they are", () => {
    const getTime = vi.spyOn(Date.prototype, "getTime");
    const mapSize = vi.spyOn(Map.prototype, "size", "get");
    try {
      const differ = intersection(
        transform(number(), () => [1, 2]),
        transform(number(), () => [3, 4]),
      );
      expect(issuesOf(differ(0)).map(({ path }) => path)).toEqual([[0], [1]]);
      expect(getTime).not.toHaveBeenCalled();
      expect(mapSize).not.toHaveBeenCalled();
    } finally {
      getTime.mockRestore();
      mapSize.mockRestore();
    }
  });
});
