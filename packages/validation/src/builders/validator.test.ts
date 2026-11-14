import { describe, expect, expectTypeOf, it } from "vitest";

import { object } from "../composition/object";
import { pipe } from "../composition/pipe";
import { describe as describeSchema } from "../core/describe";
import { fail, pass } from "../core/result";
import type { AsyncSchema, Infer, InferInput, Schema, ValidationResult, Validator } from "../core/types";
import { string } from "../primitives/string";
import { isPending, issuesOf } from "../test-utils";
import { validator } from "./validator";

const even = validator((input) =>
  typeof input === "number" && input % 2 === 0 ? pass(input) : fail({ code: "not_even" }),
);

describe("validator", () => {
  it("should give what the function returns, a value that passed or the issues of one that did not", () => {
    expect(even(4)).toEqual({ ok: true, value: 4 });
    expect(even(3)).toEqual({ ok: false, error: { issues: [{ code: "not_even", path: [] }] } });
  });

  it("should be taken by a composer, which places its issues under the child", () => {
    const counted = object({ count: even });
    expect(counted({ count: 2 })).toEqual({ ok: true, value: { count: 2 } });
    expect(issuesOf(counted({ count: 3 }))).toEqual([{ code: "not_even", path: ["count"] }]);
  });

  it("should keep the path the function wrote, under the place a composer gives it", () => {
    const deep = validator(() => fail({ code: "x", path: ["a", 0] }));
    expect(issuesOf(deep(1))).toEqual([{ code: "x", path: ["a", 0] }]);
    expect(issuesOf(object({ list: deep })({ list: 1 }))).toEqual([{ code: "x", path: ["list", "a", 0] }]);
  });

  it("should give a promise only when the function does, and place what it resolves to", async () => {
    const later = validator(async (input) => (input === "taken" ? fail({ code: "taken" }) : pass(String(input))));
    expect(isPending(even(4))).toBe(false);
    const pending = object({ name: later })({ name: "taken" });
    expect(isPending(pending)).toBe(true);
    expect(issuesOf(await pending)).toEqual([{ code: "taken", path: ["name"] }]);
    await expect(later("free")).resolves.toEqual({ ok: true, value: "free" });
  });

  it("should give the result of a validator the function calls, as part of the same validation", () => {
    const trimmed = string({ trim: true, min: 1 });
    const named = validator((input) => trimmed(input));
    expect(named("  Ada ")).toEqual({ ok: true, value: "Ada" });
    expect(issuesOf(object({ name: named })({ name: " " })).map((found) => [found.code, found.path])).toEqual([
      ["too_small", ["name"]],
    ]);
  });

  it("should run after a validator in a pipe, on the value that one produced", () => {
    const length = validator((input) => pass((input as string).length));
    expect(pipe(string({ trim: true }), length)(" ab ")).toEqual({ ok: true, value: 2 });
  });

  it("should be a Standard Schema, which words an issue that has no message as an invalid value", () => {
    expect(even["~standard"].version).toBe(1);
    expect(even["~standard"].validate(4)).toEqual({ value: 4 });
    expect(even["~standard"].validate(3)).toEqual({ issues: [{ message: "Invalid value", path: [] }] });
    const worded = validator(() => fail({ code: "x", message: "Mine" }));
    expect(worded["~standard"].validate(1)).toEqual({ issues: [{ message: "Mine", path: [] }] });
  });

  it("should say nothing of itself to a reader of the schema", () => {
    expect(describeSchema(even)).toBeUndefined();
  });

  it("should throw when created with anything but a function", () => {
    expect(() => validator(undefined as never)).toThrow(
      new TypeError("validate must be a function, received undefined"),
    );
    expect(() => validator({ ok: true, value: 1 } as never)).toThrow(TypeError);
  });

  it("should throw when the function returns no result, and let what it throws through", () => {
    const none = "A validator written by hand must return pass(value) or fail(issue)";
    expect(() => validator((() => undefined) as never)(1)).toThrow(new TypeError(none));
    expect(() => validator(((input: unknown) => input) as never)(1)).toThrow(none);
    const thrown = new Error("bug");
    expect(() =>
      validator((): ValidationResult<unknown> => {
        throw thrown;
      })(1),
    ).toThrow(thrown);
  });

  it("should throw when the function returns an issue fail() would refuse, as it waits too", async () => {
    const failing = (issues: unknown[]) => validator(() => ({ ok: false, error: { issues } }) as never);
    expect(() => failing([{ path: "confirm" }])(1)).toThrow(
      new TypeError("issue.path must be a list of keys and indexes"),
    );
    expect(() => failing([{ code: 1 }])(1)).toThrow(TypeError);
    expect(() => failing([{ message: ["no"] }])(1)).toThrow(TypeError);
    expect(() => failing([[{ code: "a" }]])(1)).toThrow(new TypeError("An issue must be an object, received a list"));
    // oxlint-disable-next-line no-sparse-arrays
    expect(() => failing([, { code: "a" }])(1)).toThrow(
      new TypeError("An issue must be an object, received undefined"),
    );
    const waiting = validator(async () => ({ ok: false, error: { issues: [{ path: "confirm" }] } }) as never);
    await expect(waiting(1)).rejects.toThrow("issue.path must be a list of keys and indexes");
    expect(issuesOf(failing([{ code: "a", path: ["b", 0] }])(1))).toEqual([{ code: "a", path: ["b", 0] }]);
  });
});

describe("the type of what validator makes", () => {
  it("should read the value from what the function returns", () => {
    expectTypeOf(even).toEqualTypeOf<Schema<number>>();
    expectTypeOf<Infer<typeof even>>().toEqualTypeOf<number>();
    const literal = validator((input) => ({ ok: true as const, value: String(input) }));
    expectTypeOf(literal).toEqualTypeOf<Schema<string>>();
    const dated = validator((input): ValidationResult<Date> => pass(input as Date));
    expectTypeOf(dated).toEqualTypeOf<Schema<Date>>();
  });

  it("should produce nothing when the function only fails", () => {
    expectTypeOf(validator(() => fail({ code: "never" }))).toEqualTypeOf<Schema<never>>();
  });

  it("should be asynchronous when the function may return a promise, even beside a result", () => {
    const later = validator(async (input) => pass(String(input)));
    expectTypeOf(later).toEqualTypeOf<AsyncSchema<string>>();
    const literal = validator(async (input) => ({ ok: true as const, value: Number(input) }));
    expectTypeOf(literal).toEqualTypeOf<AsyncSchema<number>>();
    const either = validator((input) => (input === 1 ? pass(1) : Promise.resolve(pass(2))));
    expectTypeOf(either).toEqualTypeOf<AsyncSchema<number>>();
  });

  it("should keep the input a function typed as a validator declared, and take unknown otherwise", () => {
    const textToNumber: Validator<number, string> = (input) => pass(Number(input));
    const fromText = validator(textToNumber);
    expectTypeOf(fromText).toEqualTypeOf<Schema<number, string>>();
    expectTypeOf<InferInput<typeof fromText>>().toEqualTypeOf<string>();
    expectTypeOf<InferInput<typeof even>>().toEqualTypeOf<unknown>();
  });

  it("should refuse a function that returns no result", () => {
    // @ts-expect-error the input given back is no result
    const given = validator((input: unknown) => input);
    expect(() => given(1)).toThrow("must return pass(value) or fail(issue)");
    // @ts-expect-error nor is a boolean
    validator((input: unknown) => typeof input === "string");
    // @ts-expect-error nor a promise of one
    validator(async (input: unknown) => input);
  });
});
