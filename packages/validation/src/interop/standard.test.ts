import { describe, expect, expectTypeOf, it } from "vitest";

import { object } from "../composition/object";
import { fail, pass } from "../core/result";
import type { AsyncValidator } from "../core/types";
import { email } from "../formats/email";
import { englishMessages } from "../messages/english-messages";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { isFree, isPending } from "../test-utils";
import { standard } from "./standard";
import type { StandardSchemaV1 } from "./standard-schema";

describe("standard", () => {
  const signup = standard(object({ email: email(), age: number({ int: true }) }), englishMessages);

  it("should describe itself as a Standard Schema v1 from this vendor", () => {
    expect(signup["~standard"].version).toBe(1);
    expect(signup["~standard"].vendor).toBe("codenhub");
  });

  it("should be assignable to StandardSchemaV1 with the output type", () => {
    const schema: StandardSchemaV1<unknown, { email: string; age: number }> = signup;
    expect(schema).toBe(signup);
    expectTypeOf<StandardSchemaV1.InferOutput<typeof signup>>().toEqualTypeOf<{ email: string; age: number }>();
  });

  it("should return the value on success, with no issues", () => {
    expect(signup["~standard"].validate({ email: "a@example.com", age: 3 })).toEqual({
      value: { email: "a@example.com", age: 3 },
    });
  });

  it("should return every issue as a message and a path on failure, with no value", () => {
    const result = signup["~standard"].validate({ email: "nope", age: 1.5 });
    expect(result).toEqual({
      issues: [
        { message: "Invalid email address", path: ["email"] },
        { message: "Must be an integer", path: ["age"] },
      ],
    });
    expect("value" in result).toBe(false);
  });

  it("should keep working as the validator it wraps, with the same results", () => {
    const inner = object({ age: number() });
    const wrapped = standard(inner, englishMessages);
    expect(wrapped({ age: 1 })).toEqual(inner({ age: 1 }));
    expect(wrapped({})).toEqual(inner({}));
  });

  it("should not modify the validator it was given, which keeps its own short wording", () => {
    const inner = number({ int: true });
    const own = inner["~standard" as keyof typeof inner];
    const exposed = standard(inner, englishMessages);
    expect(inner["~standard" as keyof typeof inner]).toBe(own);
    expect(exposed["~standard"]).not.toBe(own);
  });

  it("should word an issue as its map does, where the validator's own Standard Schema words it briefly", () => {
    const inner = email();
    const own = (inner as unknown as StandardSchemaV1<unknown, string>)["~standard"];
    expect(own.validate("x")).toEqual({ issues: [{ message: "Invalid email", path: [] }] });
    expect(standard(inner)["~standard"].validate("x")).toEqual({
      issues: [{ message: "Invalid email address", path: [] }],
    });
  });

  it("should give each call its own wrapper, so the same validator can be exposed with different messages", () => {
    const inner = number({ min: 1 });
    const english = standard(inner, englishMessages);
    const portuguese = standard(inner, { ...englishMessages, too_small: "Muito pequeno" });
    expect(english["~standard"].validate(0)).toEqual({ issues: [{ message: "Must be at least 1", path: [] }] });
    expect(portuguese["~standard"].validate(0)).toEqual({ issues: [{ message: "Muito pequeno", path: [] }] });
  });

  it("should word issues in English when given no message map", () => {
    const signup = standard(object({ email: email(), age: number({ min: 18 }) }));
    expect(signup["~standard"].validate({ email: "nope", age: 3 })).toEqual({
      issues: [
        { message: "Invalid email address", path: ["email"] },
        { message: "Must be at least 18", path: ["age"] },
      ],
    });
    expect(standard(string(), undefined)["~standard"].validate(1)).toEqual(
      standard(string(), englishMessages)["~standard"].validate(1),
    );
  });

  it.each([
    ["null", null, "null"],
    ["text", "en", "string"],
    ["a list", [], "array"],
  ])(
    "should reject %s as the message map when it is created, rather than word every issue alike",
    (_, map, received) => {
      expect(() => standard(string(), map as never)).toThrow(
        new TypeError(`messages must be a message map, such as englishMessages, received ${received}`),
      );
    },
  );

  it("should prefer an issue's own message, then the map, then the built-in wording", () => {
    const custom = standard(() => fail({ code: "mine", message: "Fixed" }, { code: "other" }, { code: "custom" }), {
      other: "From map",
    });
    expect(custom["~standard"].validate(1)).toEqual({
      issues: [
        { message: "Fixed", path: [] },
        { message: "From map", path: [] },
        { message: "Invalid value", path: [] },
      ],
    });
  });

  it("should be synchronous for a synchronous validator and asynchronous for an asynchronous one", async () => {
    expect(isPending(signup["~standard"].validate({}))).toBe(false);

    const username: AsyncValidator<string> = isFree;
    const asynchronous = standard(username, englishMessages);
    const result = asynchronous["~standard"].validate("taken");
    expect(isPending(result)).toBe(true);
    expect(await result).toEqual({ issues: [{ message: "Invalid value", path: [] }] });
    expect(await asynchronous["~standard"].validate("ok")).toEqual({ value: "ok" });
  });

  it("should pass through a value that a validator changed", () => {
    expect(standard(string({ trim: true }), englishMessages)["~standard"].validate("  a  ")).toEqual({ value: "a" });
    expect(standard(() => pass(42), englishMessages)["~standard"].validate("x")).toEqual({ value: 42 });
  });

  it("should never put the input in a message", () => {
    const result = signup["~standard"].validate({ email: "hunter2", age: 1 });
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });

  it("should return a Promise for a validator that returns another kind of thenable", async () => {
    // A thenable that is not a Promise, as some query builders and promise libraries return.
    const thenable = <T>(value: T): PromiseLike<T> => ({
      // oxlint-disable-next-line unicorn/no-thenable -- a thenable is what is under test
      then: (onFulfilled) => thenable(onFulfilled ? onFulfilled(value) : value) as never,
    });
    const custom: AsyncValidator<string> = () => thenable(fail({ code: "taken" }));
    const result = standard(custom, englishMessages)["~standard"].validate("a");
    // The specification shows callers awaiting only a Promise; anything else they read as settled.
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toEqual({ issues: [{ message: "Invalid value", path: [] }] });
  });
});
