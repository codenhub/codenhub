import { describe, expect, expectTypeOf, it } from "vitest";

import { BaseValidator, type Infer, type InferInput, type ValidationContext } from "./core";
import { val } from "./index";
import { ValidationError, type ValidationErr, type ValidationResult } from "./result";
import { type StandardSchemaV1 } from "./standard-schema";

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

  it("handles parse and parseAsync success and throws", async () => {
    const validator = new SimpleStringValidator();

    expect(validator.parse("valid")).toBe("valid");

    expect(() => validator.parse(123)).toThrow(ValidationError);
    expect(() => validator.parse(123)).toThrow(Error);

    let caughtError: unknown;
    try {
      validator.parse(123);
    } catch (caught) {
      caughtError = caught;
    }
    expect(caughtError).toBeInstanceOf(ValidationError);
    expect(caughtError).toBeInstanceOf(Error);
    const err = caughtError as ValidationError;
    expect(err.code).toBe("invalid_type");
    expect(err.message).toBe("Expected string");
    expect(err.flatten()).toEqual({
      formErrors: ["Expected string"],
      fieldErrors: {},
    });

    await expect(validator.parseAsync("valid_async")).resolves.toBe("valid_async");
    await expect(validator.parseAsync(456)).rejects.toThrow(ValidationError);
    await expect(validator.parseAsync(456)).rejects.toThrow(Error);
  });

  it("handles .optional() modifier", async () => {
    const validator = new SimpleStringValidator().optional();

    expect(validator.validate(undefined)).toEqual({ ok: true, value: undefined });
    expect(validator.validate("test")).toEqual({ ok: true, value: "test" });
    expect(validator.validate(42)).toMatchObject({ ok: false });
    expect(validator.is(undefined)).toBe(true);
    expect(validator.is("test")).toBe(true);
    expect(validator.is(42)).toBe(false);

    await expect(validator.validateAsync(undefined)).resolves.toEqual({ ok: true, value: undefined });
    await expect(validator.validateAsync("test")).resolves.toEqual({ ok: true, value: "test" });

    type Output = Infer<typeof validator>;
    type Input = InferInput<typeof validator>;
    expectTypeOf<[Output]>().toEqualTypeOf<[string | undefined]>();
    expectTypeOf<Input>().toEqualTypeOf<unknown>();
  });

  it("handles .nullable() modifier", async () => {
    const validator = new SimpleStringValidator().nullable();

    expect(validator.validate(null)).toEqual({ ok: true, value: null });
    expect(validator.validate("test")).toEqual({ ok: true, value: "test" });
    expect(validator.validate(undefined)).toMatchObject({ ok: false });
    expect(validator.is(null)).toBe(true);
    expect(validator.is("test")).toBe(true);
    expect(validator.is(undefined)).toBe(false);

    await expect(validator.validateAsync(null)).resolves.toEqual({ ok: true, value: null });
    await expect(validator.validateAsync("test")).resolves.toEqual({ ok: true, value: "test" });

    type Output = Infer<typeof validator>;
    expectTypeOf<Output>().toEqualTypeOf<string | null>();
  });

  it("handles .nullish() modifier", async () => {
    const validator = new SimpleStringValidator().nullish();

    expect(validator.validate(null)).toEqual({ ok: true, value: null });
    expect(validator.validate(undefined)).toEqual({ ok: true, value: undefined });
    expect(validator.validate("test")).toEqual({ ok: true, value: "test" });
    expect(validator.validate(42)).toMatchObject({ ok: false });

    await expect(validator.validateAsync(null)).resolves.toEqual({ ok: true, value: null });
    await expect(validator.validateAsync(undefined)).resolves.toEqual({ ok: true, value: undefined });
  });

  it("handles .default() with static value and function factory", async () => {
    const withStatic = new SimpleStringValidator().default("fallback");
    expect(withStatic.validate(undefined)).toEqual({ ok: true, value: "fallback" });
    expect(withStatic.validate("custom")).toEqual({ ok: true, value: "custom" });
    expect(withStatic.validate(99)).toMatchObject({ ok: false });

    let count = 0;
    const withFactory = new SimpleStringValidator().default(() => `item_${++count}`);
    expect(withFactory.validate(undefined)).toEqual({ ok: true, value: "item_1" });
    expect(withFactory.validate(undefined)).toEqual({ ok: true, value: "item_2" });
    expect(withFactory.validate("existing")).toEqual({ ok: true, value: "existing" });

    await expect(withStatic.validateAsync(undefined)).resolves.toEqual({ ok: true, value: "fallback" });
    await expect(withFactory.validateAsync(undefined)).resolves.toEqual({ ok: true, value: "item_3" });
  });

  it("handles .catch() modifier with static value and factory", async () => {
    const withCatchStatic = new SimpleStringValidator().catch("safe_default");
    expect(withCatchStatic.validate("good")).toEqual({ ok: true, value: "good" });
    expect(withCatchStatic.validate(123)).toEqual({ ok: true, value: "safe_default" });
    expect(withCatchStatic.parse(123)).toBe("safe_default");

    const withCatchFactory = new SimpleStringValidator().catch((ctx) => `recovered_${ctx.path.join(".") || "root"}`);
    expect(withCatchFactory.validate(123)).toEqual({ ok: true, value: "recovered_root" });
    expect(withCatchFactory.validate(123, { path: ["user", "name"] })).toEqual({
      ok: true,
      value: "recovered_user.name",
    });

    await expect(withCatchStatic.validateAsync(123)).resolves.toEqual({ ok: true, value: "safe_default" });
    await expect(withCatchStatic.parseAsync(123)).resolves.toBe("safe_default");
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

  it("handles .refine() rejecting async predicate synchronously", () => {
    const syncWithAsyncPred = new SimpleStringValidator().refine(
      // @ts-expect-error - testing passing async fn to sync refine
      async (val) => val === "test",
    );

    const res = syncWithAsyncPred.validate("test");
    expect(res.ok).toBe(false);
    expect((res as ValidationErr).error.message).toContain("validateAsync()");
  });

  it("handles .refineAsync() in validate, validateAsync, and parseAsync", async () => {
    const asyncRefined = new SimpleStringValidator().refineAsync(async (val) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return val === "allowed";
    }, "Value not allowed");

    // Sync validate should fail indicating async check requires validateAsync()
    const syncRes = asyncRefined.validate("allowed");
    expect(syncRes.ok).toBe(false);
    expect((syncRes as ValidationErr).error.message).toContain("validateAsync()");

    // Async validate should succeed when predicate returns true
    const asyncSuccess = await asyncRefined.validateAsync("allowed");
    expect(asyncSuccess).toEqual({ ok: true, value: "allowed" });

    // Async validate should fail when predicate returns false
    const asyncFail = await asyncRefined.validateAsync("disallowed");
    expect(asyncFail.ok).toBe(false);
    expect((asyncFail as ValidationErr).error.message).toBe("Value not allowed");

    await expect(asyncRefined.parseAsync("allowed")).resolves.toBe("allowed");
    await expect(asyncRefined.parseAsync("disallowed")).rejects.toThrow(ValidationError);
  });

  it("handles .check() and .superRefine() with boolean, string, and ctx.addIssue", async () => {
    // 1. Returning boolean
    const checkBool = new SimpleStringValidator().check((val) => val === "pass");
    expect(checkBool.validate("pass")).toEqual({ ok: true, value: "pass" });
    expect(checkBool.validate("fail")).toMatchObject({
      ok: false,
      error: { message: "Check failed" },
    });

    // 2. Returning string message
    const checkStr = new SimpleStringValidator().check((val) => {
      if (val.length < 5) {
        return "String too short";
      }
    });
    expect(checkStr.validate("short")).toEqual({ ok: true, value: "short" });
    expect(checkStr.validate("tiny")).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "String too short",
        path: [],
      },
    });

    // 3. Using ctx.addIssue targeting specific path
    const checkWithIssues = new SimpleStringValidator().check((val, ctx) => {
      if (!val.includes("@")) {
        ctx.addIssue({
          code: "invalid_format",
          message: "Must contain @",
          path: ["email_format"],
        });
      }
    });

    const issueRes = checkWithIssues.validate("no-at");
    expect(issueRes.ok).toBe(false);
    expect((issueRes as ValidationErr).error.code).toBe("invalid_format");
    expect((issueRes as ValidationErr).error.message).toBe("Must contain @");
    expect((issueRes as ValidationErr).error.path).toEqual(["email_format"]);

    // 4. superRefine alias works identically
    const superRefined = new SimpleStringValidator().superRefine((val, ctx) => {
      if (val === "invalid") {
        ctx.addIssue({ code: "custom", message: "Forbidden value", path: [] });
      }
    });
    expect(superRefined.validate("invalid").ok).toBe(false);
    expect(superRefined.validate("fine")).toEqual({ ok: true, value: "fine" });
  });

  it("handles .check() with async functions and validateAsync", async () => {
    const asyncCheck = new SimpleStringValidator().check(async (val, ctx) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (val === "taken") {
        ctx.addIssue({ code: "custom", message: "Username taken", path: ["username"] });
      }
      if (val === "error_string") {
        return "Async custom string error";
      }
      if (val === "rejected_bool") {
        return false;
      }
    });

    // Calling validate synchronously on async check fails cleanly
    const syncRes = asyncCheck.validate("taken");
    expect(syncRes.ok).toBe(false);
    expect((syncRes as ValidationErr).error.message).toContain("validateAsync()");

    // Async validate succeeds for clean value
    const passRes = await asyncCheck.validateAsync("available");
    expect(passRes).toEqual({ ok: true, value: "available" });

    // Async validate handles ctx.addIssue
    const issueRes = await asyncCheck.validateAsync("taken");
    expect(issueRes.ok).toBe(false);
    expect((issueRes as ValidationErr).error.message).toBe("Username taken");
    expect((issueRes as ValidationErr).error.path).toEqual(["username"]);

    // Async validate handles returned string
    const strRes = await asyncCheck.validateAsync("error_string");
    expect(strRes.ok).toBe(false);
    expect((strRes as ValidationErr).error.message).toBe("Async custom string error");

    // Async validate handles returned false
    const boolRes = await asyncCheck.validateAsync("rejected_bool");
    expect(boolRes.ok).toBe(false);
    expect((boolRes as ValidationErr).error.message).toBe("Check failed");
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

    // Sync transform returning Promise fails synchronously
    const asyncInSync = new SimpleStringValidator().transform(async (val) => val.toUpperCase());
    const syncRes = asyncInSync.validate("test");
    expect(syncRes.ok).toBe(false);
    expect((syncRes as ValidationErr).error.message).toContain("validateAsync()");
  });

  it("handles .transformAsync() output mapping in validateAsync and parseAsync", async () => {
    const asyncTransform = new SimpleStringValidator().transformAsync(async (val) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return val.toUpperCase();
    });

    // Synchronous validate fails indicating async transform requires validateAsync()
    const syncRes = asyncTransform.validate("hello");
    expect(syncRes.ok).toBe(false);
    expect((syncRes as ValidationErr).error.message).toContain("validateAsync()");

    // validateAsync succeeds
    const asyncRes = await asyncTransform.validateAsync("hello");
    expect(asyncRes).toEqual({ ok: true, value: "HELLO" });

    // parseAsync succeeds
    await expect(asyncTransform.parseAsync("hello")).resolves.toBe("HELLO");

    // Rejection / error handling
    const failingTransform = new SimpleStringValidator().transformAsync(async () => {
      throw new Error("Async transform exploded");
    });
    await expect(failingTransform.parseAsync("hello")).rejects.toThrow("Async transform exploded");
  });

  it("handles .pipe() pipeline across different validators", async () => {
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

    // Async pipeline validation
    await expect(stringToInt.validateAsync("  3000  ")).resolves.toEqual({ ok: true, value: 3000 });
  });

  it("preserves path and options in ValidationContext", () => {
    class CustomContextCheckValidator extends BaseValidator<string, string> {
      protected _validate(_input: unknown, ctx: ValidationContext): ValidationResult<string> {
        return {
          ok: false,
          error: new ValidationError({
            code: "custom",
            message: "Target issue",
            path: ctx.options.path ?? [],
          }),
        };
      }
    }

    const piped = new SimpleStringValidator().pipe(new CustomContextCheckValidator());
    expect(piped.validate("value", { path: ["user", "profile"] })).toEqual({
      ok: false,
      error: {
        code: "custom",
        message: "Target issue",
        path: ["user", "profile"],
      },
    });
  });

  it("conforms to the Standard Schema ~standard v1 specification", async () => {
    const schema = val.string().min(3);
    const standard = schema["~standard"];

    expect(standard.version).toBe(1);
    expect(standard.vendor).toBe("codenhub");

    // Synchronous standard validation success
    const successResult = standard.validate("codenhub");
    expect(successResult).toEqual({ value: "codenhub" });

    // Synchronous standard validation failure
    const failureResult = standard.validate("ab");
    expect(failureResult).toMatchObject({
      issues: [
        {
          message: expect.any(String),
          path: [],
        },
      ],
    });

    // Standard Schema with async validator
    const asyncSchema = val.string().refineAsync(async (val) => val === "superadmin");
    const asyncStandard = asyncSchema["~standard"];
    expect(asyncStandard.version).toBe(1);
    expect(asyncStandard.vendor).toBe("codenhub");

    const asyncStandardSuccess = await asyncStandard.validate("superadmin");
    expect(asyncStandardSuccess).toEqual({ value: "superadmin" });

    const asyncStandardFailure = await asyncStandardFailureResult(asyncStandard.validate("guest"));
    expect(asyncStandardFailure).toMatchObject({
      issues: [
        {
          message: expect.any(String),
        },
      ],
    });

    // Standard Schema type inference test
    type InferredInput = StandardSchemaV1.InferInput<typeof schema>;
    type InferredOutput = StandardSchemaV1.InferOutput<typeof schema>;
    expectTypeOf<InferredOutput>().toEqualTypeOf<string>();
    expectTypeOf<InferredInput>().toEqualTypeOf<unknown>();
  });

  /* oxlint-disable promise/prefer-await-to-then */
  it("fails synchronous validate() with async-required error when CatchValidator wraps an async validator", () => {
    const asyncSchema = val.string().refineAsync(async (s) => s.length > 3);
    const catchSchema = asyncSchema.catch("fallback");

    // Synchronous validation should NOT resolve fallback for async-required errors
    const syncRes = catchSchema.validate("ok");
    expect(syncRes.ok).toBe(false);
    expect((syncRes as ValidationErr).error.message).toContain("validateAsync()");

    // Synchronous validation on non-async schema STILL resolves fallback
    const syncCatch = val.string().min(5).catch("short");
    const syncRes2 = syncCatch.validate("hi");
    expect(syncRes2).toEqual({ ok: true, value: "short" });
  });

  it("resolves fallback in validateAsync() when inner async validator fails", async () => {
    const asyncSchema = val.string().refineAsync(async (s) => s.length > 5);
    const catchSchema = asyncSchema.catch("fallback");

    const asyncRes = await catchSchema.validateAsync("hi");
    expect(asyncRes).toEqual({ ok: true, value: "fallback" });
  });
  /* oxlint-enable promise/prefer-await-to-then */

  it("does not trigger second validation run in ~standard when synchronous error message contains 'validateAsync()'", () => {
    let callCount = 0;
    const customValidator = val.custom((_input, ctx) => {
      callCount++;
      return ctx.fail({
        code: "custom",
        message: "You must use validateAsync() instead of manual loops",
      });
    });

    const standardResult = customValidator["~standard"].validate("test");
    // Should be synchronous result and evaluated only once
    expect(callCount).toBe(1);
    expect(standardResult).toMatchObject({
      issues: [
        {
          message: "You must use validateAsync() instead of manual loops",
        },
      ],
    });
  });
});

async function asyncStandardFailureResult<T>(
  result: StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>>,
): Promise<StandardSchemaV1.FailureResult> {
  const resolved = await result;
  if (resolved.issues === undefined) {
    throw new Error("Expected standard schema validation to fail with issues");
  }
  return resolved;
}
