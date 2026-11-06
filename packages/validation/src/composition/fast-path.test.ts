import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { checkFields } from "../builders/check-fields";
import { format } from "../builders/format";
import { guard } from "../builders/guard";
import { endsWith } from "../checks/ends-with";
import { multipleOf } from "../checks/multiple-of";
import { pattern } from "../checks/pattern";
import { startsWith } from "../checks/starts-with";
import { fastOf, MISS, withFast } from "../core/nesting";
import { fail, pass } from "../core/result";
import type { AnyValidator } from "../core/types";
import { email } from "../formats/email";
import { uuid } from "../formats/uuid";
import { boolean } from "../primitives/boolean";
import { instanceOf } from "../primitives/instance-of";
import { literal } from "../primitives/literal";
import { number } from "../primitives/number";
import { oneOf } from "../primitives/one-of";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { array } from "./array";
import { nullable } from "./nullable";
import { nullish } from "./nullish";
import { object } from "./object";
import { optional } from "./optional";
import { record } from "./record";
import { tagged } from "./tagged";
import { transform } from "./transform";
import { tuple } from "./tuple";
import { union } from "./union";

/** The same validator with no fast test, so every composer around it does its full work. */
const slow = <T extends AnyValidator>(validator: T): T => ((input: unknown) => validator(input)) as T;

const build = (leaf: (validator: AnyValidator) => AnyValidator) =>
  object({
    name: leaf(string({ trim: true, min: 2, max: 20 })),
    email: leaf(email()),
    id: leaf(uuid()),
    age: optional(leaf(number({ int: true, min: 0 }))),
    role: leaf(oneOf(["admin", "user"])),
    kind: leaf(literal("person")),
    tags: array(leaf(string({ case: "lower" })), { max: 3 }),
    parent: nullable(leaf(uuid())),
    note: nullish(leaf(string())),
    flags: optional(array(leaf(boolean())), true as never),
    extra: leaf(unknown()),
  });

const fastSchema = build((validator) => validator);
const slowSchema = build(slow);

const valid = {
  name: "  Ada  ",
  email: "Ada@EXAMPLE.com",
  id: "123E4567-E89B-12D3-A456-426614174000",
  age: 36,
  role: "admin",
  kind: "person",
  tags: ["A", "b"],
  parent: null,
  note: undefined,
  extra: { anything: true },
};

describe("the fast path of valid input", () => {
  it("should exist for an object whose every part has one, and not for one that cannot", () => {
    expect(fastOf(fastSchema)).toBeDefined();
    expect(fastOf(slowSchema)).toBeUndefined();
    expect(
      fastOf(object({ a: guard("thing", (input): input is object => typeof input === "object")() })),
    ).toBeUndefined();
    expect(fastOf(optional(string(), () => "made"))).toBeUndefined();
    expect(fastOf(string((value) => (value === "" ? [{ code: "custom", path: [] }] : undefined)))).toBeUndefined();
  });

  it.each([
    ["valid input", valid],
    ["input without the optional parts", { ...valid, age: undefined, flags: undefined, note: null }],
    ["a property of the wrong type", { ...valid, age: "36" }],
    ["text a format refuses", { ...valid, email: "nope" }],
    ["a collection too long", { ...valid, tags: ["a", "b", "c", "d"] }],
    ["a value outside a choice", { ...valid, role: "root" }],
    ["text too short once trimmed", { ...valid, name: " A " }],
    ["a property given as undefined", { ...valid, kind: undefined }],
    ["a missing property", Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "kind"))],
    ["no object", ["not", "an", "object"]],
    ["an unknown property, which is dropped", { ...valid, other: 1 }],
  ])("should give what the full work gives, for %s", (_, input) => {
    expect(fastSchema(input)).toEqual(slowSchema(input));
  });

  it("should give what the full work gives for strict and passthrough objects", () => {
    for (const unknownKeys of ["strict", "passthrough"] as const) {
      const quick = object({ a: string() }, { unknownKeys });
      const full = object({ a: slow(string()) }, { unknownKeys });
      for (const input of [{ a: "x" }, { a: "x", b: 1 }, { a: 1, b: 1 }]) {
        expect(quick(input)).toEqual(full(input));
      }
    }
  });

  it("should give what the full work gives for an object with a validator of unknown keys", () => {
    const quick = object({ a: string() }, { unknownKeys: number() });
    const full = object({ a: slow(string()) }, { unknownKeys: slow(number()) });
    const parsed = JSON.parse('{"a":"x","__proto__":1}') as unknown;
    for (const input of [{ a: "x" }, { a: "x", b: 1 }, { b: 1, a: "x", c: 2 }, { a: "x", b: "1" }, { a: 1 }, parsed]) {
      expect(quick(input)).toEqual(full(input));
    }
    expect(fastOf(quick)).toBeDefined();
    // Without a fast test for the unknown keys, there is none for the object.
    expect(fastOf(object({ a: string() }, { unknownKeys: slow(number()) }))).toBeUndefined();
  });

  it("should give what the full work gives for arrays, holes included", () => {
    const quick = array(number(), { min: 1, max: 3 });
    const full = array(slow(number()), { min: 1, max: 3 });
    // oxlint-disable-next-line no-sparse-arrays
    for (const input of [[1, 2], [], [1, 2, 3, 4], [1, "2"], [1, , 3], "1,2"]) {
      expect(quick(input)).toEqual(full(input));
    }
  });

  it("should read each property of valid input once", () => {
    let reads = 0;
    const input = {
      get a() {
        reads += 1;
        return "x";
      },
    };
    expect(object({ a: string() })(input).ok).toBe(true);
    expect(reads).toBe(1);
  });

  it("should run the test of a guard once, even for input that fails", () => {
    let calls = 0;
    const thing = guard("thing", (input): input is string => {
      calls += 1;
      return input === "thing";
    });
    expect(object({ a: thing(), b: string() })({ a: "other", b: "x" }).ok).toBe(false);
    expect(calls).toBe(1);
  });

  it("should run the test of a format or a class's own instanceof once, when a later part fails", () => {
    let calls = 0;
    const slug = format("slug", (text) => {
      calls += 1;
      return text === "ok";
    });
    expect(object({ a: slug(), b: string() })({ a: "ok", b: 1 }).ok).toBe(false);
    expect(calls).toBe(1);
    class Tagged {
      static [Symbol.hasInstance](input: unknown): boolean {
        calls += 1;
        return input === "tagged";
      }
    }
    calls = 0;
    expect(object({ a: instanceOf(Tagged), b: string() })({ a: "tagged", b: 1 }).ok).toBe(false);
    expect(calls).toBe(1);
  });

  it("should answer an object with checks from its properties' fast tests, and run each check once", () => {
    let calls = 0;
    const differ = (value: { a: string; b: string }) => {
      calls += 1;
      return value.a === value.b ? [{ code: "custom", path: ["b"] }] : undefined;
    };
    const quick = object({ a: string(), b: string() }, differ);
    const full = object({ a: slow(string()), b: string() }, differ);
    // The object has no fast test of its own, so a parent that missed later would run its checks again.
    expect(fastOf(quick)).toBeUndefined();
    for (const input of [{ a: "x", b: "y" }, { a: "x", b: "x" }, { a: 1, b: "x" }, { a: "x", b: "y", c: 1 }, "no"]) {
      calls = 0;
      const answer = quick(input);
      const quickCalls = calls;
      calls = 0;
      expect(answer).toEqual(full(input));
      expect(quickCalls).toBe(calls);
    }
    calls = 0;
    const parent = object({ items: array(quick), other: string() });
    expect(
      parent({
        items: [
          { a: "x", b: "y" },
          { a: "x", b: "x" },
        ],
        other: 1,
      }),
    ).toEqual(
      object({ items: array(full), other: string() })({
        items: [
          { a: "x", b: "y" },
          { a: "x", b: "x" },
        ],
        other: 1,
      }),
    );
    expect(calls).toBe(4);
  });

  it("should exist for a leaf whose every check is built in, and give what the full work gives", () => {
    expect(fastOf(string(startsWith("x"), pattern(/y$/)))).toBeDefined();
    expect(fastOf(email(endsWith(".com")))).toBeDefined();
    expect(fastOf(string(startsWith("x"), (value) => (value === "" ? [] : undefined)))).toBeUndefined();
    const quick = object({ a: string({ trim: true }, startsWith("x"), pattern(/y$/)), b: number(multipleOf(2)) });
    const full = object({ a: slow(string({ trim: true }, startsWith("x"), pattern(/y$/))), b: number(multipleOf(2)) });
    for (const input of [
      { a: " xy ", b: 4 },
      { a: "zy", b: 4 },
      { a: "xz", b: 3 },
      { a: 1, b: 4 },
    ]) {
      expect(quick(input)).toEqual(full(input));
    }
  });

  it("should word a built-in check's failure once, when its message is a function", () => {
    let calls = 0;
    const message = () => {
      calls += 1;
      return "Must start with x";
    };
    expect(object({ a: string(startsWith("x", message)), b: string() })({ a: "y", b: "z" }).ok).toBe(false);
    expect(calls).toBe(1);
  });

  it("should make a fresh output, and never return the input itself", () => {
    const list = ["a"];
    const result = array(string())(list);
    expect(result.ok && result.value).toEqual(["a"]);
    expect(result.ok && result.value).not.toBe(list);
  });

  describe("an object some of whose properties have no fast test", () => {
    const counted = () => {
      const calls = { count: 0 };
      const length = transform(string(), (text) => {
        calls.count += 1;
        return text.length;
      });
      return [calls, length] as const;
    };
    const inputs: unknown[] = [
      { a: "four", b: "y", c: "z" },
      { a: "four", b: 1, c: "z" },
      { a: 4, b: "y", c: "z" },
      { a: 4, b: 1, c: "z" },
      { b: "y", c: "z" },
      { a: "four", b: "y", c: "z", d: 1 },
      { a: "four", b: "y", c: "z", ["__proto__"]: 1 },
      JSON.parse('{"a":"four","b":"y","c":"z","__proto__":{"admin":true}}'),
      "no",
    ];

    it("should give what the full work gives, and run the transform as often", () => {
      for (const unknownKeys of ["strip", "strict", "passthrough"] as const) {
        const [quickCalls, quickLength] = counted();
        const [fullCalls, fullLength] = counted();
        const quick = object({ a: quickLength, b: string(), c: optional(string()) }, { unknownKeys });
        const full = object({ a: fullLength, b: slow(string()), c: optional(slow(string())) }, { unknownKeys });
        for (const input of inputs) {
          quickCalls.count = 0;
          fullCalls.count = 0;
          expect(quick(input)).toEqual(full(input));
          expect(quickCalls.count).toBe(fullCalls.count);
          expect(quickCalls.count).toBeLessThanOrEqual(1);
        }
      }
    });

    it("should give what the full work gives with several such properties, each run once", async () => {
      const calls: string[] = [];
      const build = (wrap: (validator: AnyValidator) => AnyValidator) =>
        object({
          a: transform(string(), (text) => {
            calls.push(`a ${text}`);
            return text.length;
          }),
          b: wrap(number()),
          c: transform(string(), async (text) => {
            calls.push(`c ${text}`);
            return text.toUpperCase();
          }),
          d: wrap(optional(string())),
          e: transform(optional(string()), (text) => {
            calls.push(`e ${String(text)}`);
            return text;
          }),
        });
      const quick = build((validator) => validator);
      const full = build(slow);
      for (const input of [
        { a: "x", b: 1, c: "y", d: "z", e: "w" },
        { a: "x", b: 1, c: "y" },
        { a: 1, b: 1, c: "y", d: "z", e: "w" },
        { a: "x", b: "1", c: "y", d: "z", e: "w" },
        { a: "x", b: 1, c: 2, d: "z", e: 3 },
        { a: "x", b: 1, c: "y", d: 4, e: "w" },
      ]) {
        calls.length = 0;
        // One at a time, since each reads the calls the one before it logged.
        // oxlint-disable-next-line no-await-in-loop
        const answer = await quick(input);
        const quickCalls = [...calls];
        calls.length = 0;
        // oxlint-disable-next-line no-await-in-loop
        expect(answer).toEqual(await full(input));
        expect(quickCalls).toEqual(calls);
      }
    });

    it("should give what the full work gives for a transform whose validator has a fast test", async () => {
      let calls = 0;
      const convert = (value: unknown) => {
        calls += 1;
        return [value];
      };
      const inners: [AnyValidator, unknown[]][] = [
        [string({ trim: true, min: 2 }), [" ab ", " a ", 1]],
        [object({ a: number() }), [{ a: 1 }, { a: "1" }, null]],
        [array(string(), { max: 1 }), [["a"], ["a", "b"], [1]]],
        [optional(number(), 3), [undefined, 1, "1"]],
      ];
      for (const [inner, inputs] of inners) {
        expect(fastOf(inner)).toBeDefined();
        for (const input of inputs) {
          calls = 0;
          const quick = transform(inner, convert)(input);
          const quickCalls = calls;
          calls = 0;
          expect(quick).toEqual(transform(slow(inner), convert)(input));
          expect(quickCalls).toBe(calls);
          expect(object({ x: transform(inner, convert) })({ x: input })).toEqual(
            object({ x: transform(slow(inner), convert) })({ x: input }),
          );
        }
      }
      expect(fastOf(transform(string(), convert))).toBeUndefined();
    });

    it("should give a property with a fast test what it produced, when a later one misses", () => {
      // Produces a value its own test would not give again, so running it a second time, on what it
      // produced, would be seen by the field check.
      const doubled = withFast(
        (input: unknown) =>
          typeof input === "number" ? pass(input * 2) : fail({ code: "custom", message: "Not a number" }),
        (input) => (typeof input === "number" ? input * 2 : MISS),
      );
      const [, length] = counted();
      const quick = object(
        { d: doubled, a: length, b: string() },
        checkFields<{ d: number; a: number; b: string }, "d">(["d"], (value) => value.d !== 4),
      );
      const full = object(
        { d: slow(doubled), a: length, b: slow(string()) },
        checkFields<{ d: number; a: number; b: string }, "d">(["d"], (value) => value.d !== 4),
      );
      for (const input of [
        { d: 2, a: "x", b: 1 },
        { d: 2, a: 1, b: "y" },
        { d: 2, a: "x", b: "y" },
      ]) {
        expect(quick(input)).toEqual(full(input));
      }
      expect(quick({ d: 2, a: "x", b: 1 }).ok).toBe(false);
    });

    it("should run the transform once when another property fails, and not when its own value does", () => {
      const [calls, length] = counted();
      const schema = object({ a: length, b: string() });
      expect(schema({ a: "four", b: 1 }).ok).toBe(false);
      expect(calls.count).toBe(1);
      calls.count = 0;
      expect(schema({ a: 4, b: "y" }).ok).toBe(false);
      expect(calls.count).toBe(0);
      calls.count = 0;
      expect(schema({ a: "four", b: "y" })).toEqual({ ok: true, value: { a: 4, b: "y" } });
      expect(calls.count).toBe(1);
    });

    it("should run the transform and each check once, for checks and field checks", () => {
      let checks = 0;
      const [calls, length] = counted();
      const [fullCalls, fullLength] = counted();
      const same = check<{ a: number; b: string }>((value) => {
        checks += 1;
        return value.a !== 1;
      });
      const fields = checkFields<{ a: number; b: string }, "a" | "b">(["a", "b"], (value) => {
        checks += 1;
        return value.a !== 2;
      });
      for (const extra of [[same], [fields], [same, fields]]) {
        const quick = object({ a: length, b: string() }, ...(extra as []));
        const full = object({ a: fullLength, b: slow(string()) }, ...(extra as []));
        for (const input of [
          { a: "x", b: "y" },
          { a: "xy", b: "y" },
          { a: "abc", b: "y" },
          { a: "xy", b: 1 },
          { a: 1, b: "y" },
        ]) {
          calls.count = 0;
          checks = 0;
          const answer = quick(input);
          const quickChecks = checks;
          expect(calls.count).toBeLessThanOrEqual(1);
          fullCalls.count = 0;
          checks = 0;
          expect(answer).toEqual(full(input));
          expect(calls.count).toBe(fullCalls.count);
          expect(quickChecks).toBe(checks);
        }
      }
    });

    it("should run an asynchronous transform once, and give what the full work gives", async () => {
      let calls = 0;
      const later = (fast: boolean) =>
        object({
          a: transform(string(), async (text) => {
            calls += 1;
            return text.length;
          }),
          b: fast ? string() : slow(string()),
        });
      for (const input of [
        { a: "four", b: "y" },
        { a: "four", b: 1 },
        { a: 4, b: "y" },
      ]) {
        calls = 0;
        // One at a time, since each reads the calls the one before it counted.
        // oxlint-disable-next-line no-await-in-loop
        const answer = await later(true)(input);
        const quickCalls = calls;
        calls = 0;
        // oxlint-disable-next-line no-await-in-loop
        expect(answer).toEqual(await later(false)(input));
        expect(quickCalls).toBe(calls);
      }
    });

    it("should run the transform once for each item of a list, at the paths the full work gives", () => {
      const [calls, length] = counted();
      const [fullCalls, fullLength] = counted();
      const quick = array(object({ a: length, b: string() }));
      const full = array(object({ a: fullLength, b: slow(string()) }));
      const input = [
        { a: "x", b: "y" },
        { a: "xy", b: 1 },
        { a: 1, b: "y" },
      ];
      expect(quick(input)).toEqual(full(input));
      expect(calls.count).toBe(2);
      expect(fullCalls.count).toBe(2);
    });

    it("should read each property once, for input that passes and input that fails", () => {
      const [, length] = counted();
      for (const b of ["y", 1]) {
        const reads = { a: 0, b: 0 };
        const input = {
          get a() {
            reads.a += 1;
            return "four";
          },
          get b() {
            reads.b += 1;
            return b;
          },
        };
        object({ a: length, b: string() })(input);
        expect(reads).toEqual({ a: 1, b: 1 });
      }
    });
  });

  it("should exist for a tuple, record, union and tagged whose every part has one, and not for one that cannot", () => {
    expect(fastOf(tuple([number(), string()], { rest: boolean() }))).toBeDefined();
    expect(fastOf(record(string(), number()))).toBeDefined();
    expect(fastOf(union([string(), number()]))).toBeDefined();
    expect(fastOf(tagged("type", { a: object({ x: number() }) }))).toBeDefined();
    expect(fastOf(tuple([number(), slow(string())]))).toBeUndefined();
    expect(fastOf(tuple([number()], { rest: slow(string()) }))).toBeUndefined();
    expect(fastOf(record(slow(string()), number()))).toBeUndefined();
    expect(fastOf(record(string(), slow(number())))).toBeUndefined();
    expect(fastOf(union([string(), slow(number())]))).toBeUndefined();
    expect(fastOf(tagged("type", { a: object({ x: number() }), b: slow(object({})) }))).toBeUndefined();
    const always = () => undefined;
    expect(fastOf(union([string()], always))).toBeUndefined();
    expect(fastOf(tagged("type", { a: object({}) }, always))).toBeUndefined();
  });

  it("should give what the full work gives for tuples, with and without rest", () => {
    const quick = tuple([number(), string()], { rest: boolean(), max: 4 });
    const full = tuple([slow(number()), string()], { rest: boolean(), max: 4 });
    const exact = tuple([number(), string({ trim: true })]);
    const exactFull = tuple([number(), slow(string({ trim: true }))]);
    for (const input of [
      [1, "a"],
      [1, "a", true],
      [1],
      [1, "a", true, false, true],
      [1, 2],
      // oxlint-disable-next-line no-sparse-arrays
      [, "a"],
      [1, "a", "t"],
      "1",
    ]) {
      expect(quick(input)).toEqual(full(input));
      expect(exact(input)).toEqual(exactFull(input));
    }
  });

  it("should give what the full work gives for records, a repeated key included", () => {
    const quick = record(string({ trim: true, min: 1 }), number(), { max: 2 });
    const full = record(string({ trim: true, min: 1 }), slow(number()), { max: 2 });
    for (const input of [{ a: 1 }, {}, { a: 1, b: 2, c: 3 }, { a: "1" }, { " ": 1 }, { " a": 1, a: 2 }, [], null]) {
      expect(quick(input)).toEqual(full(input));
    }
  });

  it("should give what the full work gives for unions, choosing the first option that accepts", () => {
    const quick = union([string({ trim: true }), string(), object({ a: number() })]);
    const full = union([slow(string({ trim: true })), string(), object({ a: number() })]);
    for (const input of [" x ", "x", { a: 1 }, { a: "1" }, 1, null]) {
      expect(quick(input)).toEqual(full(input));
    }
  });

  it("should give what the full work gives for tagged objects", () => {
    const variants = (wrap: (validator: AnyValidator) => AnyValidator) => ({
      a: object({ x: wrap(number()) }),
      b: object({ y: string() }, { unknownKeys: "strict" }),
    });
    const quick = tagged(
      "type",
      variants((validator) => validator),
    );
    const full = tagged("type", variants(slow));
    for (const input of [
      { type: "a", x: 1 },
      { x: 1, type: "a" },
      { type: "b", y: "s" },
      { type: "b", y: "s", z: 1 },
      { type: "a", x: "1" },
      { type: "c" },
      { type: 1 },
      { x: 1 },
      [],
    ]) {
      expect(quick(input)).toEqual(full(input));
    }
  });
});
