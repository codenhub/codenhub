import { describe, expect, it } from "vitest";

import { guard } from "../builders/guard";
import { fastOf } from "../core/nesting";
import type { AnyValidator } from "../core/types";
import { email } from "../formats/email";
import { uuid } from "../formats/uuid";
import { boolean } from "../primitives/boolean";
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

/** The same validator with no fast test, so every composer around it does its full work. */
const slow =
  (validator: AnyValidator): AnyValidator =>
  (input: unknown) =>
    validator(input);

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
    ["a missing property", { ...valid, kind: undefined }],
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

  it("should make a fresh output, and never return the input itself", () => {
    const list = ["a"];
    const result = array(string())(list);
    expect(result.ok && result.value).toEqual(["a"]);
    expect(result.ok && result.value).not.toBe(list);
  });
});
