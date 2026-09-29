import { describe, expect, expectTypeOf, it } from "vitest";

import { object } from "../composition/object";
import { fail, pass } from "../core/result";
import type { AsyncValidator } from "../core/types";
import { email } from "../formats/email";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { isFree, isPending } from "../test-utils";
import { standard } from "./standard";
import type { StandardSchemaV1 } from "./standard-schema";

describe("standard", () => {
  const signup = standard(object({ email: email(), age: number({ int: true }) }));

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
    const wrapped = standard(inner);
    expect(wrapped({ age: 1 })).toEqual(inner({ age: 1 }));
    expect(wrapped({})).toEqual(inner({}));
  });

  it("should not modify the validator it was given", () => {
    const inner = number();
    standard(inner);
    expect("~standard" in inner).toBe(false);
  });

  it("should give each call its own wrapper, so the same validator can be exposed with different messages", () => {
    const inner = number({ min: 1 });
    const english = standard(inner);
    const portuguese = standard(inner, { too_small: "Muito pequeno" });
    expect(english["~standard"].validate(0)).toEqual({ issues: [{ message: "Must be at least 1", path: [] }] });
    expect(portuguese["~standard"].validate(0)).toEqual({ issues: [{ message: "Muito pequeno", path: [] }] });
  });

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
    const asynchronous = standard(username);
    const result = asynchronous["~standard"].validate("taken");
    expect(isPending(result)).toBe(true);
    expect(await result).toEqual({ issues: [{ message: "Invalid value", path: [] }] });
    expect(await asynchronous["~standard"].validate("ok")).toEqual({ value: "ok" });
  });

  it("should pass through a value that a validator changed", () => {
    expect(standard(string({ trim: true }))["~standard"].validate("  a  ")).toEqual({ value: "a" });
    expect(standard(() => pass(42))["~standard"].validate("x")).toEqual({ value: 42 });
  });

  it("should never put the input in a message", () => {
    const result = signup["~standard"].validate({ email: "hunter2", age: 1 });
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });
});
