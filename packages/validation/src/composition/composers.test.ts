import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import type { AnyValidator, Check, MessageOptions, ValidationResult } from "../core/types";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { issuesOf, isPending } from "../test-utils";
import { array } from "./array";
import { intersection } from "./intersection";
import { json } from "./json";
import { lazy } from "./lazy";
import { map } from "./map";
import { object } from "./object";
import { record } from "./record";
import { set } from "./set";
import { tagged } from "./tagged";
import { tuple } from "./tuple";
import { union } from "./union";

type Tail = [MessageOptions?, ...Check<never>[]] | Check<never>[];
type Make = (...rest: Tail) => (input: unknown) => ValidationResult<unknown>;

/** Each composer, input it accepts, input whose child fails, and input it rejects itself. */
const composers: [name: string, make: Make, good: unknown, badChild: unknown, badOwn: unknown][] = [
  ["object", (...rest) => object({ n: number() }, ...(rest as [])), { n: 1 }, { n: "x" }, []],
  ["array", (...rest) => array(number(), ...(rest as [])), [1], ["x"], {}],
  ["tuple", (...rest) => tuple([number()], ...(rest as [])), [1], ["x"], [1, 2]],
  ["record", (...rest) => record(string(), number(), ...(rest as [])), { a: 1 }, { a: "x" }, []],
  ["set", (...rest) => set(number(), ...(rest as [])), new Set([1]), new Set(["x"]), []],
  ["map", (...rest) => map(string(), number(), ...(rest as [])), new Map([["a", 1]]), new Map([["a", "x"]]), {}],
  ["union", (...rest) => union([number()], ...(rest as [])), 1, undefined, "x"],
  [
    "tagged",
    (...rest) => tagged("t", { a: object({ n: number() }) }, ...(rest as [])),
    { t: "a", n: 1 },
    { t: "a", n: "x" },
    { t: "z" },
  ],
  [
    "intersection",
    (...rest) => intersection(object({ n: number() }), object({ n: number() }), ...(rest as [])),
    { n: 1 },
    { n: "x" },
    undefined,
  ],
  ["lazy", (...rest) => lazy(() => number(), ...(rest as [])), 1, undefined, undefined],
  ["json", (...rest) => json(object({ n: number() }), ...(rest as [])), '{"n":1}', '{"n":"x"}', "{"],
];

const refuse: Check<never> = () => [{ code: "refused", path: [] }];

describe.each(composers)("%s", (_name, make, good, badChild) => {
  it("should run checks once every child passed, with or without options", () => {
    expect(issuesOf(make(refuse)(good)).map((issue) => issue.code)).toEqual(["refused"]);
    expect(issuesOf(make({}, refuse)(good)).map((issue) => issue.code)).toEqual(["refused"]);
  });

  it("should turn asynchronous with an asynchronous check", async () => {
    const later = check(async () => false) as unknown as Check<never>;
    const pending = make(later)(good);
    expect(isPending(pending)).toBe(true);
    expect(issuesOf(await pending).map((issue) => issue.code)).toEqual(["custom"]);
    expect(isPending(make(refuse)(good))).toBe(false);
  });

  it("should refuse a check that is not a function when it is created", () => {
    expect(() => make({}, 1 as unknown as Check<never>)).toThrow(TypeError);
  });

  it.skipIf(badChild === undefined)(
    "should run no check while a child fails, and leave the child's issue unworded",
    () => {
      const issues = issuesOf(make({ message: "Own" }, refuse)(badChild));
      expect(issues.map((issue) => issue.code)).not.toContain("refused");
      expect(issues.map((issue) => issue.message)).not.toContain("Own");
    },
  );
});

describe.each(composers.filter(([, , , , badOwn]) => badOwn !== undefined))(
  "%s, given input it rejects itself",
  (_name, make, _good, _badChild, badOwn) => {
    it("should word its own issue with the message option", () => {
      expect(issuesOf(make({ message: "Own" })(badOwn)).map((issue) => issue.message)).toEqual(["Own"]);
    });
  },
);

describe("checks on composers", () => {
  it("should see the whole value, so they can compare its parts", () => {
    const signup = object(
      { password: string({ min: 8 }), confirm: string() },
      check((data) => data.password === data.confirm, { path: ["confirm"], message: "Passwords must match" }),
    );
    expect(issuesOf(signup({ password: "12345678", confirm: "1234567x" }))).toEqual([
      { code: "custom", path: ["confirm"], message: "Passwords must match" },
    ]);
    expect(signup({ password: "12345678", confirm: "12345678" }).ok).toBe(true);
  });

  it("should nest under the parent's path like any issue", () => {
    const inner = object(
      { a: number() },
      check((value) => value.a > 0, { path: ["a"] }),
    );
    expect(issuesOf(object({ outer: inner })({ outer: { a: -1 } }))[0]?.path).toEqual(["outer", "a"]);
  });

  it("should word an unrecognized key, which the object reports itself", () => {
    const strict = object({}, { unknownKeys: "strict", message: "No extras" });
    expect(issuesOf(strict({ extra: 1 }))).toEqual([
      { code: "unrecognized_key", path: ["extra"], params: { key: "extra" }, message: "No extras" },
    ]);
  });

  it("should leave a validator given as a child untouched", () => {
    const child: AnyValidator = number();
    array(
      child,
      check(() => false),
    );
    expect(child(1)).toEqual({ ok: true, value: 1 });
  });
});

describe("composer options", () => {
  it("should be read once, when the validator is made, so changing the object later changes nothing", () => {
    const options: { message?: string; min?: number } = { message: "a", min: 1 };
    const shapeOptions = { message: "a" };
    const list = array(string(), options);
    const shape = object({}, shapeOptions);
    options.message = "b";
    options.min = 5;
    shapeOptions.message = "b";
    expect(issuesOf(list(1))[0]?.message).toBe("a");
    expect(issuesOf(shape(1))[0]?.message).toBe("a");
    expect(list(["x"]).ok).toBe(true);
  });
});
