import { describe, expect, expectTypeOf, it } from "vitest";

import { BaseValidator, type Infer, type InferInput, type ValidationContext, type Validator } from "./core";
import { val } from "./index";
import { type ValidationResult } from "./result";

class SimpleStringValidator extends BaseValidator<string, unknown> {
  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<string> {
    if (typeof input !== "string") {
      return ctx.fail({
        code: "invalid_type",
        message: "Expected string",
        path: ctx.path,
        input,
      });
    }
    return ctx.ok(input);
  }
}

describe("BaseValidator and modifiers", () => {
  it("validates direct input and handles type guards via .is()", () => {
    const validator = new SimpleStringValidator();

    expect(validator.validate("hello")).toEqual({ ok: true, value: "hello" });
    expect(validator.validate(123)).toEqual({
      ok: false,
      error: {
        code: "invalid_type",
        message: "Expected string",
        path: [],
      },
    });

    expect(validator.is("hello")).toBe(true);
    expect(validator.is(123)).toBe(false);
  });

  it("handles .optional() modifier", () => {
    const validator = new SimpleStringValidator().optional();

    expect(validator.validate(undefined)).toEqual({ ok: true, value: undefined });
    expect(validator.validate("test")).toEqual({ ok: true, value: "test" });
    expect(validator.validate(42)).toMatchObject({ ok: false });
    expect(validator.is(undefined)).toBe(true);
    expect(validator.is("test")).toBe(true);
    expect(validator.is(42)).toBe(false);

    type Output = Infer<typeof validator>;
    type Input = InferInput<typeof validator>;
    expectTypeOf<[Output]>().toEqualTypeOf<[string | undefined]>();
    expectTypeOf<Input>().toEqualTypeOf<unknown>();
  });

  it("handles .nullable() modifier", () => {
    const validator = new SimpleStringValidator().nullable();

    expect(validator.validate(null)).toEqual({ ok: true, value: null });
    expect(validator.validate("test")).toEqual({ ok: true, value: "test" });
    expect(validator.validate(undefined)).toMatchObject({ ok: false });
    expect(validator.is(null)).toBe(true);
    expect(validator.is("test")).toBe(true);
    expect(validator.is(undefined)).toBe(false);

    type Output = Infer<typeof validator>;
    expectTypeOf<Output>().toEqualTypeOf<string | null>();
  });

  it("handles .nullish() modifier", () => {
    const validator = new SimpleStringValidator().nullish();

    expect(validator.validate(null)).toEqual({ ok: true, value: null });
    expect(validator.validate(undefined)).toEqual({ ok: true, value: undefined });
    expect(validator.validate("test")).toEqual({ ok: true, value: "test" });
    expect(validator.validate(42)).toMatchObject({ ok: false });
  });

  it("handles .default() with static value and function factory", () => {
    const withStatic = new SimpleStringValidator().default("fallback");
    expect(withStatic.validate(undefined)).toEqual({ ok: true, value: "fallback" });
    expect(withStatic.validate("custom")).toEqual({ ok: true, value: "custom" });
    expect(withStatic.validate(99)).toMatchObject({ ok: false });

    let count = 0;
    const withFactory = new SimpleStringValidator().default(() => `item_${++count}`);
    expect(withFactory.validate(undefined)).toEqual({ ok: true, value: "item_1" });
    expect(withFactory.validate(undefined)).toEqual({ ok: true, value: "item_2" });
    expect(withFactory.validate("existing")).toEqual({ ok: true, value: "existing" });
  });

  it("handles .refine() with custom message and structured options", () => {
    const refinedString = new SimpleStringValidator().refine((val) => val.startsWith("ok_"), "Must start with ok_");

    expect(refinedString.validate("ok_user")).toEqual({ ok: true, value: "ok_user" });
    expect(refinedString.validate("bad_user")).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Must start with ok_",
        path: [],
      },
    });

    const structuredRefined = new SimpleStringValidator().refine((val) => val.length > 3, {
      code: "too_small",
      message: "Too short",
      path: ["length_check"],
    });

    expect(structuredRefined.validate("ab")).toEqual({
      ok: false,
      error: {
        code: "too_small",
        message: "Too short",
        path: ["length_check"],
      },
    });
  });

  it("handles .refine() error throwing", () => {
    const throwingRefined = new SimpleStringValidator().refine(() => {
      throw new Error("Explosion in predicate");
    });

    expect(throwingRefined.validate("test")).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Explosion in predicate",
        path: [],
      },
    });
  });

  it("handles .transform() output mapping and error throwing", () => {
    const lengthValidator = new SimpleStringValidator().transform((val) => val.length);

    expect(lengthValidator.validate("antigravity")).toEqual({ ok: true, value: 11 });

    type Output = Infer<typeof lengthValidator>;
    expectTypeOf<Output>().toEqualTypeOf<number>();

    const throwingTransform = new SimpleStringValidator().transform(() => {
      throw new Error("Parsing blew up");
    });
    expect(throwingTransform.validate("data")).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Parsing blew up",
        path: [],
      },
    });
  });

  it("handles .pipe() pipeline across different validators", () => {
    const stringToInt = val
      .string()
      .trim()
      .transform((val) => Number.parseInt(val, 10))
      .pipe(val.number().positive().port());

    expect(stringToInt.validate("  8080  ")).toEqual({ ok: true, value: 8080 });

    const invalidNumber = stringToInt.validate("  -5  ");
    expect(invalidNumber).toMatchObject({
      ok: false,
      error: {
        code: "invalid_value",
      },
    });

    const nonNumber = stringToInt.validate(123 as unknown as string);
    expect(nonNumber).toMatchObject({
      ok: false,
      error: {
        code: "invalid_type",
      },
    });
  });

  it("preserves path and options in ValidationContext", () => {
    const customContextCheck: Validator<string, string> = {
      validate(_input, options) {
        return {
          ok: false,
          error: {
            code: "custom",
            message: "Target issue",
            path: options?.path ?? [],
          },
        };
      },
      is(input): input is string {
        return typeof input === "string";
      },
      optional() {
        return this;
      },
      nullable() {
        return this;
      },
      nullish() {
        return this;
      },
      default() {
        return this;
      },
      refine() {
        return this;
      },
      transform() {
        return this as unknown as Validator<never, string>;
      },
      pipe() {
        return this as unknown as Validator<never, string>;
      },
    };

    const piped = new SimpleStringValidator().pipe(customContextCheck);
    expect(piped.validate("value", { path: ["user", "profile"] })).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Target issue",
        path: ["user", "profile"],
      },
    });
  });
});
