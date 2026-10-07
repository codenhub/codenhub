import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { describe as describeValidator } from "../core/describe";
import type { Validator } from "../core/types";
import { email } from "../formats/email";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { codesOf, isFree, isPending, issuesOf, valueOf } from "../test-utils";
import { nullish } from "./nullish";
import { object } from "./object";
import { objectLike } from "./object-like";
import { omit } from "./omit";
import { optional } from "./optional";
import { partial } from "./partial";
import { pick } from "./pick";
import { required } from "./required";

const user = object({ id: number(), name: string({ min: 2 }), email: email() });
const ada = { id: 1, name: "Ada", email: "ada@example.com" };

describe("pick", () => {
  it("should keep only the named properties, each validated as before", () => {
    const contact = pick(user, ["name", "email"]);
    expect(valueOf(contact(ada))).toEqual({ name: "Ada", email: "ada@example.com" });
    expect(valueOf(contact({ name: "Ada", email: "ada@example.com" }))).toEqual({
      name: "Ada",
      email: "ada@example.com",
    });
    expect(issuesOf(contact({ name: "A", email: "ada@example.com" }))).toEqual([
      { code: "too_small", path: ["name"], params: { minimum: 2, type: "string" } },
    ]);
  });

  it("should keep the options of the object, unless given its own", () => {
    const strict = object({ a: string(), b: string() }, { unknownKeys: "strict", message: "Not that" });
    expect(codesOf(pick(strict, ["a"])({ a: "x", b: "y" }))).toEqual(["unrecognized_key"]);
    expect(issuesOf(pick(strict, ["a"])(1))[0]?.message).toBe("Not that");
    expect(valueOf(pick(strict, ["a"], { unknownKeys: "strip" })({ a: "x", b: "y" }))).toEqual({ a: "x" });
  });

  it("should keep the options of the object when its own are given as undefined, which is no options", () => {
    const strict = object({ a: string(), b: string() }, { unknownKeys: "strict", message: "Bad" });
    const inherit = undefined as { unknownKeys?: "strict" } | undefined;
    for (const made of [pick(strict, ["a"], inherit), omit(strict, ["b"], inherit), required(strict, inherit)]) {
      expect(issuesOf(made({ a: "x", b: "y", c: 1 })).map((issue) => issue.message)).toContain("Bad");
      expect(describeValidator(made)?.options).toEqual({ unknownKeys: "strict", message: "Bad" });
    }
    expect(describeValidator(partial(strict))?.options).toEqual({ unknownKeys: "strict", message: "Bad" });
  });

  it("should take checks on the new object, with its options kept", () => {
    const strict = object({ a: string(), b: string() }, { unknownKeys: "strict" });
    const picked = pick(
      strict,
      ["a"],
      check((value) => value.a !== "no", "Not no"),
    );
    expect(issuesOf(picked({ a: "no" }))[0]?.message).toBe("Not no");
    expect(codesOf(picked({ a: "x", b: "y" }))).toEqual(["unrecognized_key"]);
  });

  it("should make an object like any other, which can be described and picked from again", () => {
    const contact = pick(user, ["name", "email"]);
    expect(Object.keys(describeValidator(contact)?.["shape"] as object)).toEqual(["name", "email"]);
    expect(valueOf(pick(contact, ["name"])(ada))).toEqual({ name: "Ada" });
  });

  it("should stay synchronous for a synchronous object, and wait for an asynchronous property it keeps", async () => {
    const account = object({ name: string(), handle: isFree });
    expect(isPending(pick(user, ["name"])(ada))).toBe(false);
    const result = pick(account, ["handle"])({ handle: "taken" });
    expect(isPending(result)).toBe(true);
    expect(codesOf(await result)).toEqual(["taken"]);
  });

  it("should refuse a key the object does not have, a validator object did not make, and one with checks", () => {
    expect(() => pick(user, ["nmae" as never])).toThrow("pick() was given a key the object does not have: nmae");
    expect(() => pick(user, ["toString" as never])).toThrow("does not have: toString");
    expect(() => pick(user, "name" as never)).toThrow(TypeError);
    expect(() => pick(string() as never, [])).toThrow("pick() needs a validator made by object()");
    expect(() => pick(objectLike({ a: string() }), ["a" as never])).toThrow(
      "pick() needs a validator made by object()",
    );
    const byHand: Validator<{ a: string }> = (input) => ({ ok: true, value: input as { a: string } });
    expect(() => pick(byHand, ["a"])).toThrow("pick() needs a validator made by object()");
    const checked = object(
      { a: string(), b: string() },
      check((value) => value.a === value.b),
    );
    expect(() => pick(checked, ["a"])).toThrow("pick() cannot keep the checks of an object");
  });
});

describe("omit", () => {
  it("should leave out the named properties and keep the rest", () => {
    const profile = omit(user, ["email"]);
    expect(valueOf(profile(ada))).toEqual({ id: 1, name: "Ada" });
    expect(valueOf(profile({ id: 1, name: "Ada" }))).toEqual({ id: 1, name: "Ada" });
    expect(codesOf(profile({ id: 1 }))).toEqual(["invalid_type"]);
  });

  it("should keep the options of the object unless given its own, and take checks", () => {
    const strict = object({ a: string(), b: string() }, { unknownKeys: "strict" });
    expect(codesOf(omit(strict, ["b"])({ a: "x", c: 1 }))).toEqual(["unrecognized_key"]);
    expect(valueOf(omit(strict, ["b"], { unknownKeys: "strip" })({ a: "x", c: 1 }))).toEqual({ a: "x" });
    const checked = omit(
      strict,
      ["b"],
      check((value) => value.a !== "", "Empty"),
    );
    expect(issuesOf(checked({ a: "" })).map((issue) => issue.message)).toEqual(["Empty"]);
    expect(codesOf(checked({ a: "x", c: 1 }))).toEqual(["unrecognized_key"]);
    expect(() => omit(strict, "b" as never)).toThrow("keys must be a list of property names, received string");
  });

  it("should take a property written with a number by that number, as its type names it", () => {
    const row = object({ 0: string(), 1: string(), label: string() });
    expect(valueOf(pick(row, [0])({ 0: "a" }))).toEqual({ 0: "a" });
    expect(valueOf(omit(row, [0, "label"])({ 1: "b" }))).toEqual({ 1: "b" });
    expect(() => pick(row, [2 as never])).toThrow("pick() was given a key the object does not have: 2");
  });

  it("should refuse a key the object does not have", () => {
    expect(() => omit(user, ["emial" as never])).toThrow("omit() was given a key the object does not have: emial");
  });
});

describe("partial", () => {
  it("should make every property of an object validator optional, and keep its options", () => {
    const patch = partial(object({ name: string({ min: 2 }), email: email() }, { unknownKeys: "strict" }));
    expect(valueOf(patch({}))).toEqual({});
    expect(valueOf(patch({ name: "Ada" }))).toEqual({ name: "Ada" });
    expect(codesOf(patch({ name: "A" }))).toEqual(["too_small"]);
    expect(codesOf(patch({ extra: 1 }))).toEqual(["unrecognized_key"]);
  });

  it("should still return a shape for a shape", () => {
    const shape = partial({ name: string() });
    expect(typeof shape.name).toBe("function");
    expect(valueOf(object(shape)({}))).toEqual({});
  });

  it("should refuse an object with checks, and a validator object did not make", () => {
    expect(() =>
      partial(
        object(
          { a: string() },
          check(() => true),
        ),
      ),
    ).toThrow("partial() cannot keep the checks");
    expect(() => partial(string() as never)).toThrow("partial() needs a validator made by object()");
  });
});

describe("required", () => {
  const draft = object({
    title: optional(string()),
    views: optional(number(), 0),
    note: nullish(string()),
    id: number(),
  });

  it("should require what optional and nullish made optional, and keep null where it was accepted", () => {
    const published = required(draft);
    expect(valueOf(published({ title: "Hi", views: 2, note: null, id: 1 }))).toEqual({
      title: "Hi",
      views: 2,
      note: null,
      id: 1,
    });
    expect(issuesOf(published({ id: 1 })).map((issue) => issue.path)).toEqual([["title"], ["views"], ["note"]]);
  });

  it("should keep the options of the object unless given its own, and take checks", () => {
    const strict = object({ a: optional(string()) }, { unknownKeys: "strict" });
    expect(codesOf(required(strict)({ a: "x", c: 1 }))).toEqual(["unrecognized_key"]);
    expect(valueOf(required(strict, { unknownKeys: "strip" })({ a: "x", c: 1 }))).toEqual({ a: "x" });
    const checked = required(
      strict,
      check((value) => value.a !== "", "Empty"),
    );
    expect(issuesOf(checked({ a: "" })).map((issue) => issue.message)).toEqual(["Empty"]);
    expect(codesOf(checked({ a: "x", c: 1 }))).toEqual(["unrecognized_key"]);
  });

  it("should undo partial", () => {
    const whole = required(partial(user));
    expect(valueOf(whole(ada))).toEqual(ada);
    expect(codesOf(whole({ id: 1, name: "Ada" }))).toEqual(["invalid_type"]);
  });

  it("should refuse an object with checks, and a validator object did not make", () => {
    expect(() =>
      required(
        object(
          { a: string() },
          check(() => true),
        ),
      ),
    ).toThrow("required() cannot keep the checks");
    expect(() => required(string() as never)).toThrow("required() needs a validator made by object()");
  });
});
