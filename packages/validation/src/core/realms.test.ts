import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { coerceDate } from "../coercion/coerce-date";
import { discriminatedUnion } from "../composition/discriminated-union";
import { map } from "../composition/map";
import { object } from "../composition/object";
import { record } from "../composition/record";
import { set } from "../composition/set";
import { date } from "../primitives/date";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { issuesOf, valueOf } from "../test-utils";
import { entriesOf, isPlainObject, sizeOfMap, sizeOfSet, timeOf, valuesOf } from "./objects";
import { describeType } from "./result";

/*
 * Objects made in a `vm` context stand for those from an iframe or another window: they have the
 * shape of ours and a prototype that is not ours, so `instanceof` and a comparison with our own
 * `Object.prototype` both say no.
 */
const foreign = <T>(code: string): T => runInNewContext(code) as T;

describe("values from another realm", () => {
  it("should be told from ours by identity, so the test means something", () => {
    expect(foreign<object>("({})") instanceof Object).toBe(false);
    expect(foreign<Date>("new Date()") instanceof Date).toBe(false);
    expect(foreign<Map<unknown, unknown>>("new Map()") instanceof Map).toBe(false);
  });

  it("should be plain objects when they are", () => {
    expect(isPlainObject(foreign("({ a: 1 })"))).toBe(true);
    expect(isPlainObject(foreign("Object.create(null)"))).toBe(true);
    expect(isPlainObject(foreign("JSON.parse('{\"a\":1}')"))).toBe(true);
  });

  it("should not be plain objects when they are instances, arrays or built with a prototype of their own", () => {
    expect(isPlainObject(foreign("new (class Widget {})()"))).toBe(false);
    expect(isPlainObject(foreign("[]"))).toBe(false);
    expect(isPlainObject(foreign("Object.create({ inherited: 1 })"))).toBe(false);
    expect(isPlainObject(foreign("Object.create(Object.create(null))"))).toBe(false);
    expect(isPlainObject(Object.create({ inherited: 1 }))).toBe(false);
  });

  it("should be read as dates, maps and sets, and so should ours", () => {
    expect([timeOf(foreign("new Date(5)")), timeOf(new Date(5)), timeOf(foreign("new Date(NaN)"))]).toEqual([
      5,
      5,
      Number.NaN,
    ]);
    expect([
      sizeOfMap(foreign("new Map([[1, 2]])")),
      sizeOfMap(new Map()),
      sizeOfSet(foreign("new Set([1, 2])")),
    ]).toEqual([1, 0, 2]);
    expect(entriesOf(foreign("new Map([['a', 1]])"))).toEqual([["a", 1]]);
    expect(valuesOf(foreign("new Set([1, 2])"))).toEqual([1, 2]);
  });

  it("should not be mistaken for a date, map or set by resembling one", () => {
    const lookalike = { getTime: () => 0, has: () => true, size: 1, [Symbol.toStringTag]: "Date" };
    expect([timeOf(lookalike), sizeOfMap(lookalike), sizeOfSet(lookalike)]).toEqual([undefined, undefined, undefined]);
    expect([timeOf(new Set()), sizeOfMap(new Set()), sizeOfSet(new Map()), timeOf(null), sizeOfMap(undefined)]).toEqual(
      Array(5).fill(undefined),
    );
  });

  it("should be accepted by object and record, and copied into this realm", () => {
    expect(valueOf(object({ a: number() })(foreign("({ a: 1 })")))).toEqual({ a: 1 });
    expect(valueOf(record(string(), number())(foreign("({ a: 1 })")))).toEqual({ a: 1 });
    expect(valueOf(discriminatedUnion("t", { x: object({ n: number() }) })(foreign("({ t: 'x', n: 1 })")))).toEqual({
      t: "x",
      n: 1,
    });
  });

  it("should be accepted by date, coerceDate, map and set", () => {
    expect(date()(foreign("new Date(0)")).ok).toBe(true);
    expect(date()(foreign("new Date(NaN)")).ok).toBe(false);
    expect(valueOf(coerceDate()(foreign("new Date(0)"))).getTime()).toBe(0);
    expect(valueOf(map(string(), number())(foreign("new Map([['a', 1]])")))).toEqual(new Map([["a", 1]]));
    expect(valueOf(set(number())(foreign("new Set([1, 2])")))).toEqual(new Set([1, 2]));
  });

  it("should be named by what they are", () => {
    expect([describeType(foreign("new Date(0)")), describeType(foreign("new Date(NaN)"))]).toEqual([
      "date",
      "invalid date",
    ]);
    expect([
      describeType(foreign("new Map()")),
      describeType(foreign("new Set()")),
      describeType(foreign("({})")),
    ]).toEqual(["map", "set", "object"]);
  });
});

describe("an object with a prototype of its own", () => {
  it("should be rejected, and named so the message does not read 'Expected object, received Object'", () => {
    const [issue] = issuesOf(object({ a: number() })(Object.create({ a: 1 })));
    expect(issue?.params).toEqual({ expected: "object", received: "non-plain object" });
  });

  it("should keep the class name of an instance, and fall back to object for a nameless class", () => {
    expect(describeType(new (class Widget {})())).toBe("Widget");
    expect(describeType(new (class {})())).toBe("object");
  });
});

describe("a value that is one of the kinds but has lost its prototype", () => {
  const bare = <T extends object>(value: T): T => Object.setPrototypeOf(value, null) as T;

  it("should still be read by the built-in methods, not through methods it no longer has", () => {
    expect(timeOf(valueOf(date()(bare(new Date(0)))))).toBe(0);
    expect(timeOf(valueOf(coerceDate()(bare(new Date(0)))))).toBe(0);
    expect(valueOf(map(string(), number())(bare(new Map([["a", 1]]))))).toEqual(new Map([["a", 1]]));
    expect(valueOf(set(number())(bare(new Set([1, 2]))))).toEqual(new Set([1, 2]));
  });

  it("should be checked against min, max and size like any other", () => {
    expect(date({ min: new Date(5) })(bare(new Date(0))).ok).toBe(false);
    expect(map(string(), number(), { max: 0 })(bare(new Map([["a", 1]]))).ok).toBe(false);
    expect(set(number(), { min: 3 })(bare(new Set([1]))).ok).toBe(false);
  });
});

describe("an object whose prototype cannot be inspected", () => {
  const hostile = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error("boom");
      },
    },
  );

  it("should be rejected, not thrown from", () => {
    expect(isPlainObject(hostile)).toBe(false);
    expect(issuesOf(object({})(hostile)).map((issue) => issue.code)).toEqual(["invalid_type"]);
    expect(issuesOf(record(string(), number())(hostile)).map((issue) => issue.code)).toEqual(["invalid_type"]);
  });
});
