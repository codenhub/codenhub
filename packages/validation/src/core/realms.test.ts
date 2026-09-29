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
import { isDate, isMap, isPlainObject, isSet } from "./objects";
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

  it("should be recognized as dates, maps and sets, and our own kinds of them", () => {
    expect([isDate(foreign("new Date()")), isMap(foreign("new Map()")), isSet(foreign("new Set()"))]).toEqual([
      true,
      true,
      true,
    ]);
    expect([isDate(new Date()), isMap(new Map()), isSet(new Set())]).toEqual([true, true, true]);
  });

  it("should not be mistaken for a date, map or set by resembling one", () => {
    const lookalike = { getTime: () => 0, has: () => true, [Symbol.toStringTag]: "Date" };
    expect([isDate(lookalike), isMap(lookalike), isSet(lookalike)]).toEqual([false, false, false]);
    expect([isDate(new Set()), isMap(new Set()), isSet(new Map()), isDate(null), isMap(undefined)]).toEqual(
      Array(5).fill(false),
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
