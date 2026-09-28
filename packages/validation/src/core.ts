import {
  fail,
  ok,
  type ValidationErrorOptions,
  type ValidationErr,
  type ValidationIssue,
  type ValidationOk,
  type ValidationOptions,
  type ValidationPathSegment,
  type ValidationResult,
} from "./result";
import { type StandardSchemaV1 } from "./standard-schema";

/**
 * Execution context passed to validators during validation.
 *
 * Provides access to configured options, the current path, and mechanisms
 * for collecting issues and producing results.
 */
export interface ValidationContext {
  /** Path segments leading to the current validation target. */
  path: readonly ValidationPathSegment[];
  /** Options passed to the validation call. */
  options: ValidationOptions;
  /**
   * Registers a validation issue into the accumulated issues list.
   *
   * @param issue - The validation issue to record.
   */
  addIssue(issue: ValidationIssue): void;
  /**
   * Creates a failed validation result using the current context settings.
   *
   * @param messageOrOptions - Custom error message string or structured failure options.
   * @returns A failed validation result.
   */
  fail(messageOrOptions: string | ValidationErrorOptions): ValidationErr;
  /**
   * Creates a successful validation result.
   *
   * @param value - The successfully validated value.
   * @returns A successful validation result carrying the value.
   */
  ok<T>(value: T): ValidationOk<T>;
}

/**
 * Core interface implemented by all schema validators.
 *
 * @typeParam TOutput - The type produced when validation succeeds.
 * @typeParam TInput - The input type accepted by this validator.
 */
export interface Validator<TOutput, TInput = unknown> {
  /** Phantom property holding the inferred output type. */
  readonly _output?: TOutput;
  /** Phantom property holding the inferred input type. */
  readonly _input?: TInput;

  /** Standard Schema v1 specification implementation. */
  readonly "~standard": StandardSchemaV1.Props<TInput, TOutput>;

  /**
   * Validates input data against this schema synchronously.
   *
   * @param input - Data to validate.
   * @param options - Optional validation configuration.
   * @returns A discriminated validation result (`ValidationOk` or `ValidationErr`).
   */
  validate(input: TInput, options?: ValidationOptions): ValidationResult<TOutput>;

  /**
   * Validates input data against this schema asynchronously.
   *
   * @param input - Data to validate.
   * @param options - Optional validation configuration.
   * @returns Promise resolving to a discriminated validation result.
   */
  validateAsync(input: TInput, options?: ValidationOptions): Promise<ValidationResult<TOutput>>;

  /**
   * Validates input data and returns the validated output value synchronously,
   * throwing a {@link ValidationError} if invalid.
   *
   * @param input - Data to validate.
   * @param options - Optional validation configuration.
   * @returns The validated output value.
   * @throws {@link ValidationError} when validation fails.
   */
  parse(input: TInput, options?: ValidationOptions): TOutput;

  /**
   * Validates input data and returns the validated output value asynchronously,
   * throwing a {@link ValidationError} if invalid.
   *
   * @param input - Data to validate.
   * @param options - Optional validation configuration.
   * @returns Promise resolving to the validated output value.
   * @throws {@link ValidationError} when validation fails.
   */
  parseAsync(input: TInput, options?: ValidationOptions): Promise<TOutput>;

  /**
   * Type guard checking whether unknown input satisfies this validator's schema.
   *
   * @param input - Unknown value to test.
   * @returns `true` if input is valid; otherwise `false`.
   */
  is(input: unknown): input is TOutput;

  /**
   * Wraps this validator to accept `undefined`, returning `ok(undefined)`.
   *
   * @returns An optional validator.
   */
  optional(): Validator<TOutput | undefined, TInput | undefined>;

  /**
   * Wraps this validator to accept `null`, returning `ok(null)`.
   *
   * @returns A nullable validator.
   */
  nullable(): Validator<TOutput | null, TInput | null>;

  /**
   * Wraps this validator to accept `null` or `undefined`, returning `ok(null)` or `ok(undefined)`.
   *
   * @returns A nullish validator.
   */
  nullish(): Validator<TOutput | null | undefined, TInput | null | undefined>;

  /**
   * Specifies a fallback value or factory function when the received input is `undefined`.
   *
   * @param fallback - The fallback value or a zero-argument function returning one.
   * @returns A validator returning the fallback value for `undefined` input.
   */
  default(fallback: TOutput | (() => TOutput)): Validator<TOutput, TInput | undefined>;

  /**
   * Catches validation failures and returns a fallback value or the result of a fallback factory.
   *
   * @param fallback - Fallback value or function receiving the validation context.
   * @returns A validator returning the fallback value when validation fails.
   */
  catch(fallback: TOutput | ((ctx: ValidationContext) => TOutput)): Validator<TOutput, TInput>;

  /**
   * Appends a custom refinement predicate to this validator.
   *
   * @param predicate - Predicate function returning `true` when output is valid.
   * @param error - Optional error message or options used if the predicate fails.
   * @returns A refined validator.
   */
  refine(predicate: (val: TOutput) => boolean, error?: string | ValidationErrorOptions): Validator<TOutput, TInput>;

  /**
   * Appends an asynchronous refinement predicate to this validator.
   *
   * @param predicate - Predicate function returning a Promise resolving to `true` when valid.
   * @param error - Optional error message or options used if the predicate fails.
   * @returns A refined validator requiring asynchronous validation.
   */
  refineAsync(
    predicate: (val: TOutput) => Promise<boolean>,
    error?: string | ValidationErrorOptions,
  ): Validator<TOutput, TInput>;

  /**
   * Attaches a validation check function with contextual issue reporting.
   *
   * If `fn` returns `false`, a validation error is emitted. If `fn` returns a string,
   * that string is used as the error message. If `fn` uses `ctx.addIssue()`, the recorded
   * issues trigger a failure.
   *
   * @param fn - Check function returning void, boolean, string, or a Promise.
   * @returns A validator with the attached check.
   */
  check(
    fn: (
      val: TOutput,
      ctx: ValidationContext,
    ) =>
      | void
      | boolean
      | string
      | Promise<void>
      | Promise<boolean>
      | Promise<string>
      | Promise<void | boolean | string>,
  ): Validator<TOutput, TInput>;

  /**
   * Alias for `check()` enabling advanced contextual issue reporting.
   *
   * @param fn - Check function returning void, boolean, string, or a Promise.
   * @returns A validator with the attached check.
   */
  superRefine(
    fn: (
      val: TOutput,
      ctx: ValidationContext,
    ) =>
      | void
      | boolean
      | string
      | Promise<void>
      | Promise<boolean>
      | Promise<string>
      | Promise<void | boolean | string>,
  ): Validator<TOutput, TInput>;

  /**
   * Transforms the successfully validated output to a new value or type synchronously.
   *
   * @typeParam TNext - Resulting output type.
   * @param fn - Pure transformation function.
   * @returns A validator outputting the transformed value.
   */
  transform<TNext>(fn: (val: TOutput) => TNext): Validator<TNext, TInput>;

  /**
   * Transforms the successfully validated output to a new value or type asynchronously.
   *
   * @typeParam TNext - Resulting output type.
   * @param fn - Transformation function returning a Promise.
   * @returns A validator outputting the transformed value asynchronously.
   */
  transformAsync<TNext>(fn: (val: TOutput) => Promise<TNext>): Validator<TNext, TInput>;

  /**
   * Pipes the output of this validator into another validator.
   *
   * @typeParam TNext - Output type of the target validator.
   * @typeParam TNextInput - Input type expected by the target validator.
   * @param next - Validator to run on the output.
   * @returns A combined pipeline validator.
   */
  pipe<TNext, TNextInput = TOutput>(next: Validator<TNext, TNextInput>): Validator<TNext, TInput>;

  /**
   * Combines this validator with another schema using an intersection.
   *
   * @typeParam TOther - Output type of the other validator.
   * @param other - Validator schema to intersect with.
   * @returns An intersection validator requiring both schemas to succeed.
   */
  and<TOther>(other: Validator<TOther>): Validator<TOutput & TOther, TInput>;
}

/**
 * Concrete implementation of {@link ValidationContext}.
 */
class ValidationContextImpl implements ValidationContext {
  readonly path: readonly ValidationPathSegment[];
  readonly options: ValidationOptions;
  readonly issues: ValidationIssue[] = [];

  constructor(options: ValidationOptions = {}) {
    this.options = options;
    this.path = options.path ?? [];
  }

  addIssue(issue: ValidationIssue): void {
    const fullPath =
      issue.path &&
      issue.path.length >= this.path.length &&
      this.path.every((segment, idx) => issue.path[idx] === segment)
        ? issue.path
        : [...this.path, ...(issue.path ?? [])];

    this.issues.push({
      ...issue,
      path: fullPath,
    });
  }

  fail(messageOrOptions: string | ValidationErrorOptions): ValidationErr {
    if (typeof messageOrOptions === "string") {
      return fail(
        {
          code: "custom",
          message: messageOrOptions,
          path: this.path,
          issues: this.issues.length > 1 ? [...this.issues] : undefined,
        },
        this.options,
      );
    }

    return fail(
      {
        ...messageOrOptions,
        path: messageOrOptions.path ?? this.path,
        issues: messageOrOptions.issues ?? (this.issues.length > 1 ? [...this.issues] : undefined),
      },
      this.options,
    );
  }

  ok<T>(value: T): ValidationOk<T> {
    return ok(value);
  }
}

/**
 * Helper to invoke `_validate` on a `BaseValidator` or `validate` on generic `Validator`.
 */
function runValidator<TOutput, TInput>(
  validator: Validator<TOutput, TInput>,
  input: unknown,
  ctx: ValidationContext,
): ValidationResult<TOutput> {
  if (validator instanceof BaseValidator) {
    return (
      validator as unknown as {
        _validate(val: unknown, c: ValidationContext): ValidationResult<TOutput>;
      }
    )._validate(input, ctx);
  }

  return validator.validate(input as TInput, ctx.options);
}

/**
 * Helper to invoke `_validateAsync` on a `BaseValidator` or `validateAsync` on generic `Validator`.
 */
async function runValidatorAsync<TOutput, TInput>(
  validator: Validator<TOutput, TInput>,
  input: unknown,
  ctx: ValidationContext,
): Promise<ValidationResult<TOutput>> {
  if (validator instanceof BaseValidator) {
    return (
      validator as unknown as {
        _validateAsync(val: unknown, c: ValidationContext): Promise<ValidationResult<TOutput>>;
      }
    )._validateAsync(input, ctx);
  }

  return validator.validateAsync(input as TInput, ctx.options);
}

/**
 * Formats a validation result into a Standard Schema v1 Result.
 */
function toStandardResult<T>(result: ValidationResult<T>): StandardSchemaV1.Result<T> {
  if (result.ok) {
    return { value: result.value };
  }

  const issues = result.error.issues && result.error.issues.length > 0 ? result.error.issues : [result.error];

  return {
    issues: issues.map((issue) => ({
      message: issue.message,
      path: issue.path,
    })),
  };
}

/**
 * Abstract base class for all validators providing composable modifiers.
 *
 * Subclasses implement `_validate(input, ctx)` for type-specific checks and optionally
 * override `_validateAsync(input, ctx)` for asynchronous validation logic.
 *
 * @typeParam TOutput - The type produced when validation succeeds.
 * @typeParam TInput - The input type accepted by this validator.
 */
export abstract class BaseValidator<TOutput, TInput = unknown> implements Validator<TOutput, TInput> {
  declare readonly _output?: TOutput;
  declare readonly _input?: TInput;

  /**
   * Internal validation logic implemented by subclasses.
   *
   * @param input - The raw input to validate.
   * @param ctx - The execution context with configuration and issue collection.
   * @returns Validation result for this step.
   */
  protected abstract _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput>;

  /**
   * Internal asynchronous validation logic. Defaults to resolving `_validate(input, ctx)`.
   *
   * @param input - The raw input to validate.
   * @param ctx - The execution context with configuration and issue collection.
   * @returns Promise resolving to the validation result.
   */
  protected _validateAsync(input: unknown, ctx: ValidationContext): Promise<ValidationResult<TOutput>> {
    return Promise.resolve(this._validate(input, ctx));
  }

  /**
   * Indicates whether this validator requires asynchronous execution.
   */
  protected isAsync(): boolean {
    return false;
  }

  /**
   * Standard Schema v1 specification implementation.
   */
  get "~standard"(): StandardSchemaV1.Props<TInput, TOutput> {
    return {
      version: 1,
      vendor: "codenhub",
      validate: (value: unknown): StandardSchemaV1.Result<TOutput> | Promise<StandardSchemaV1.Result<TOutput>> => {
        if (this.isAsync()) {
          return this.validateAsync(value as TInput).then(toStandardResult);
        }
        try {
          const res = this.validate(value as TInput);
          if (!res.ok && res.error.message.includes("validateAsync()")) {
            return this.validateAsync(value as TInput).then(toStandardResult);
          }
          return toStandardResult(res);
        } catch {
          return this.validateAsync(value as TInput).then(toStandardResult);
        }
      },
      types: {
        input: undefined as unknown as TInput,
        output: undefined as unknown as TOutput,
      },
    };
  }

  /**
   * Validates an input against this validator's rules synchronously.
   *
   * @param input - Data to validate.
   * @param options - Validation options.
   * @returns A discriminated validation result.
   */
  validate(input: TInput, options: ValidationOptions = {}): ValidationResult<TOutput> {
    const ctx = new ValidationContextImpl(options);
    return this._validate(input, ctx);
  }

  /**
   * Validates an input against this validator's rules asynchronously.
   *
   * @param input - Data to validate.
   * @param options - Validation options.
   * @returns Promise resolving to a discriminated validation result.
   */
  async validateAsync(input: TInput, options: ValidationOptions = {}): Promise<ValidationResult<TOutput>> {
    const ctx = new ValidationContextImpl(options);
    return this._validateAsync(input, ctx);
  }

  /**
   * Validates input data and returns the validated value synchronously, throwing
   * a {@link ValidationError} if invalid.
   *
   * @param input - Data to validate.
   * @param options - Validation options.
   * @returns Validated output value.
   * @throws {@link ValidationError} when validation fails.
   */
  parse(input: TInput, options?: ValidationOptions): TOutput {
    const result = this.validate(input, options);
    if (result.ok) {
      return result.value;
    }
    throw result.error;
  }

  /**
   * Validates input data and returns the validated value asynchronously, throwing
   * a {@link ValidationError} if invalid.
   *
   * @param input - Data to validate.
   * @param options - Validation options.
   * @returns Promise resolving to the validated output value.
   * @throws {@link ValidationError} when validation fails.
   */
  async parseAsync(input: TInput, options?: ValidationOptions): Promise<TOutput> {
    const result = await this.validateAsync(input, options);
    if (result.ok) {
      return result.value;
    }
    throw result.error;
  }

  /**
   * Type guard checking whether unknown input satisfies this validator.
   *
   * @param input - Value to test.
   * @returns `true` if input is valid; otherwise `false`.
   */
  is(input: unknown): input is TOutput {
    return this.validate(input as TInput).ok;
  }

  /**
   * Wraps this validator to accept `undefined`, returning `ok(undefined)`.
   *
   * @returns An optional validator.
   */
  optional(): Validator<TOutput | undefined, TInput | undefined> {
    return new OptionalValidator(this);
  }

  /**
   * Wraps this validator to accept `null`, returning `ok(null)`.
   *
   * @returns A nullable validator.
   */
  nullable(): Validator<TOutput | null, TInput | null> {
    return new NullableValidator(this);
  }

  /**
   * Wraps this validator to accept `null` or `undefined`, returning `ok(null)` or `ok(undefined)`.
   *
   * @returns A nullish validator.
   */
  nullish(): Validator<TOutput | null | undefined, TInput | null | undefined> {
    return new NullishValidator(this);
  }

  /**
   * Specifies a fallback value or factory function when the received input is `undefined`.
   *
   * @param fallback - The fallback value or a zero-argument function returning one.
   * @returns A validator returning the fallback value for `undefined` input.
   */
  default(fallback: TOutput | (() => TOutput)): Validator<TOutput, TInput | undefined> {
    return new DefaultValidator(this, fallback);
  }

  /**
   * Catches validation failures and returns a fallback value or factory result.
   *
   * @param fallback - Fallback value or contextual function returning one.
   * @returns A validator returning the fallback value when validation fails.
   */
  catch(fallback: TOutput | ((ctx: ValidationContext) => TOutput)): Validator<TOutput, TInput> {
    return new CatchValidator(this, fallback);
  }

  /**
   * Appends a custom refinement predicate to this validator.
   *
   * @param predicate - Predicate function returning `true` when output is valid.
   * @param error - Optional error message or options used if the predicate fails.
   * @returns A refined validator.
   */
  refine(predicate: (val: TOutput) => boolean, error?: string | ValidationErrorOptions): Validator<TOutput, TInput> {
    return new RefineValidator(this, predicate, error, false);
  }

  /**
   * Appends an asynchronous refinement predicate to this validator.
   *
   * @param predicate - Predicate function returning a Promise resolving to `true` when valid.
   * @param error - Optional error message or options used if the predicate fails.
   * @returns A refined validator requiring asynchronous validation.
   */
  refineAsync(
    predicate: (val: TOutput) => Promise<boolean>,
    error?: string | ValidationErrorOptions,
  ): Validator<TOutput, TInput> {
    return new RefineValidator(this, predicate, error, true);
  }

  /**
   * Attaches a validation check function with contextual issue reporting.
   *
   * @param fn - Check function returning void, boolean, string, or a Promise.
   * @returns A validator with the attached check.
   */
  check(
    fn: (
      val: TOutput,
      ctx: ValidationContext,
    ) =>
      | void
      | boolean
      | string
      | Promise<void>
      | Promise<boolean>
      | Promise<string>
      | Promise<void | boolean | string>,
  ): Validator<TOutput, TInput> {
    return new CheckValidator(this, fn);
  }

  /**
   * Alias for `check()` enabling advanced contextual issue reporting.
   *
   * @param fn - Check function returning void, boolean, string, or a Promise.
   * @returns A validator with the attached check.
   */
  superRefine(
    fn: (
      val: TOutput,
      ctx: ValidationContext,
    ) =>
      | void
      | boolean
      | string
      | Promise<void>
      | Promise<boolean>
      | Promise<string>
      | Promise<void | boolean | string>,
  ): Validator<TOutput, TInput> {
    return new CheckValidator(this, fn);
  }

  /**
   * Transforms the successfully validated output to a new value or type synchronously.
   *
   * @typeParam TNext - Resulting output type.
   * @param fn - Pure transformation function.
   * @returns A validator outputting the transformed value.
   */
  transform<TNext>(fn: (val: TOutput) => TNext): Validator<TNext, TInput> {
    return new TransformValidator(this, fn, false);
  }

  /**
   * Transforms the successfully validated output to a new value or type asynchronously.
   *
   * @typeParam TNext - Resulting output type.
   * @param fn - Transformation function returning a Promise.
   * @returns A validator outputting the transformed value asynchronously.
   */
  transformAsync<TNext>(fn: (val: TOutput) => Promise<TNext>): Validator<TNext, TInput> {
    return new TransformValidator(this, fn, true);
  }

  /**
   * Pipes the output of this validator into another validator.
   *
   * @typeParam TNext - Output type of the target validator.
   * @typeParam TNextInput - Input type expected by the target validator.
   * @param next - Validator to run on the output.
   * @returns A combined pipeline validator.
   */
  pipe<TNext, TNextInput = TOutput>(next: Validator<TNext, TNextInput>): Validator<TNext, TInput> {
    return new PipeValidator(this, next as unknown as Validator<TNext, unknown>);
  }

  /**
   * Combines this validator with another schema using an intersection.
   *
   * @typeParam TOther - Output type of the other validator.
   * @param other - Validator schema to intersect with.
   * @returns An intersection validator requiring both schemas to succeed.
   */
  and<TOther>(_other: Validator<TOther>): Validator<TOutput & TOther, TInput> {
    throw new Error("Intersection validator not loaded");
  }
}

/**
 * Modifier validator that accepts `undefined`.
 */
class OptionalValidator<TOutput, TInput> extends BaseValidator<TOutput | undefined, TInput | undefined> {
  constructor(private readonly inner: Validator<TOutput, TInput>) {
    super();
  }

  protected override isAsync(): boolean {
    return this.inner instanceof BaseValidator ? (this.inner as unknown as { isAsync(): boolean }).isAsync() : false;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput | undefined> {
    if (input === undefined) {
      return ctx.ok(undefined);
    }
    return runValidator(this.inner, input, ctx);
  }

  protected override async _validateAsync(
    input: unknown,
    ctx: ValidationContext,
  ): Promise<ValidationResult<TOutput | undefined>> {
    if (input === undefined) {
      return ctx.ok(undefined);
    }
    return runValidatorAsync(this.inner, input, ctx);
  }
}

/**
 * Modifier validator that accepts `null`.
 */
class NullableValidator<TOutput, TInput> extends BaseValidator<TOutput | null, TInput | null> {
  constructor(private readonly inner: Validator<TOutput, TInput>) {
    super();
  }

  protected override isAsync(): boolean {
    return this.inner instanceof BaseValidator ? (this.inner as unknown as { isAsync(): boolean }).isAsync() : false;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput | null> {
    if (input === null) {
      return ctx.ok(null);
    }
    return runValidator(this.inner, input, ctx);
  }

  protected override async _validateAsync(
    input: unknown,
    ctx: ValidationContext,
  ): Promise<ValidationResult<TOutput | null>> {
    if (input === null) {
      return ctx.ok(null);
    }
    return runValidatorAsync(this.inner, input, ctx);
  }
}

/**
 * Modifier validator that accepts `null` or `undefined`.
 */
class NullishValidator<TOutput, TInput> extends BaseValidator<TOutput | null | undefined, TInput | null | undefined> {
  constructor(private readonly inner: Validator<TOutput, TInput>) {
    super();
  }

  protected override isAsync(): boolean {
    return this.inner instanceof BaseValidator ? (this.inner as unknown as { isAsync(): boolean }).isAsync() : false;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput | null | undefined> {
    if (input === undefined) {
      return ctx.ok(undefined);
    }
    if (input === null) {
      return ctx.ok(null);
    }
    return runValidator(this.inner, input, ctx);
  }

  protected override async _validateAsync(
    input: unknown,
    ctx: ValidationContext,
  ): Promise<ValidationResult<TOutput | null | undefined>> {
    if (input === undefined) {
      return ctx.ok(undefined);
    }
    if (input === null) {
      return ctx.ok(null);
    }
    return runValidatorAsync(this.inner, input, ctx);
  }
}

/**
 * Modifier validator that applies a fallback value for `undefined` inputs.
 */
class DefaultValidator<TOutput, TInput> extends BaseValidator<TOutput, TInput | undefined> {
  constructor(
    private readonly inner: Validator<TOutput, TInput>,
    private readonly fallback: TOutput | (() => TOutput),
  ) {
    super();
  }

  protected override isAsync(): boolean {
    return this.inner instanceof BaseValidator ? (this.inner as unknown as { isAsync(): boolean }).isAsync() : false;
  }

  private resolveFallback(): TOutput {
    return typeof this.fallback === "function" ? (this.fallback as () => TOutput)() : this.fallback;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
    if (input === undefined) {
      return ctx.ok(this.resolveFallback());
    }
    return runValidator(this.inner, input, ctx);
  }

  protected override async _validateAsync(input: unknown, ctx: ValidationContext): Promise<ValidationResult<TOutput>> {
    if (input === undefined) {
      return ctx.ok(this.resolveFallback());
    }
    return runValidatorAsync(this.inner, input, ctx);
  }
}

/**
 * Modifier validator that catches validation failures and returns a fallback value.
 */
class CatchValidator<TOutput, TInput> extends BaseValidator<TOutput, TInput> {
  constructor(
    private readonly inner: Validator<TOutput, TInput>,
    private readonly fallback: TOutput | ((ctx: ValidationContext) => TOutput),
  ) {
    super();
  }

  protected override isAsync(): boolean {
    return this.inner instanceof BaseValidator ? (this.inner as unknown as { isAsync(): boolean }).isAsync() : false;
  }

  private resolveFallback(ctx: ValidationContext): TOutput {
    return typeof this.fallback === "function"
      ? (this.fallback as (ctx: ValidationContext) => TOutput)(ctx)
      : this.fallback;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
    try {
      const res = runValidator(this.inner, input, ctx);
      if (res.ok) {
        return res;
      }
      return ctx.ok(this.resolveFallback(ctx));
    } catch {
      return ctx.ok(this.resolveFallback(ctx));
    }
  }

  protected override async _validateAsync(input: unknown, ctx: ValidationContext): Promise<ValidationResult<TOutput>> {
    try {
      const res = await runValidatorAsync(this.inner, input, ctx);
      if (res.ok) {
        return res;
      }
      return ctx.ok(this.resolveFallback(ctx));
    } catch {
      return ctx.ok(this.resolveFallback(ctx));
    }
  }
}

/**
 * Modifier validator that enforces an arbitrary predicate check on validated output.
 */
class RefineValidator<TOutput, TInput> extends BaseValidator<TOutput, TInput> {
  constructor(
    private readonly inner: Validator<TOutput, TInput>,
    private readonly predicate: (val: TOutput) => boolean | Promise<boolean>,
    private readonly error?: string | ValidationErrorOptions,
    private readonly asyncMode = false,
  ) {
    super();
  }

  protected override isAsync(): boolean {
    return (
      this.asyncMode ||
      (this.inner instanceof BaseValidator ? (this.inner as unknown as { isAsync(): boolean }).isAsync() : false)
    );
  }

  private failWithRefineError(val: TOutput, ctx: ValidationContext): ValidationErr {
    if (typeof this.error === "string") {
      return ctx.fail({ code: "custom", message: this.error, path: ctx.path, input: val });
    }
    if (this.error !== undefined) {
      return ctx.fail({
        code: "custom",
        ...this.error,
        path: this.error.path ?? ctx.path,
        input: "input" in this.error ? this.error.input : val,
      });
    }
    return ctx.fail({
      code: "custom",
      message: "Failed refinement predicate",
      path: ctx.path,
      input: val,
    });
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
    if (this.asyncMode) {
      return ctx.fail({
        code: "custom",
        message: "Async refinement requires validateAsync()",
        path: ctx.path,
        input,
      });
    }

    const res = runValidator(this.inner, input, ctx);
    if (!res.ok) {
      return res;
    }

    let isValid: boolean | Promise<boolean>;
    try {
      isValid = this.predicate(res.value);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Refinement check failed";
      return ctx.fail({ code: "custom", message, path: ctx.path, input: res.value });
    }

    if (
      isValid instanceof Promise ||
      (typeof isValid === "object" &&
        isValid !== null &&
        typeof (isValid as unknown as Promise<boolean>).then === "function")
    ) {
      return ctx.fail({
        code: "custom",
        message: "Async refinement requires validateAsync()",
        path: ctx.path,
        input: res.value,
      });
    }

    if (!isValid) {
      return this.failWithRefineError(res.value, ctx);
    }

    return res;
  }

  protected override async _validateAsync(input: unknown, ctx: ValidationContext): Promise<ValidationResult<TOutput>> {
    const res = await runValidatorAsync(this.inner, input, ctx);
    if (!res.ok) {
      return res;
    }

    let isValid: boolean;
    try {
      isValid = await this.predicate(res.value);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Refinement check failed";
      return ctx.fail({ code: "custom", message, path: ctx.path, input: res.value });
    }

    if (!isValid) {
      return this.failWithRefineError(res.value, ctx);
    }

    return res;
  }
}

/**
 * Modifier validator that performs advanced custom validation checks.
 */
class CheckValidator<TOutput, TInput> extends BaseValidator<TOutput, TInput> {
  constructor(
    private readonly inner: Validator<TOutput, TInput>,
    private readonly fn: (
      val: TOutput,
      ctx: ValidationContext,
    ) =>
      | void
      | boolean
      | string
      | Promise<void>
      | Promise<boolean>
      | Promise<string>
      | Promise<void | boolean | string>,
  ) {
    super();
  }

  protected override isAsync(): boolean {
    if (this.inner instanceof BaseValidator && (this.inner as unknown as { isAsync(): boolean }).isAsync()) {
      return true;
    }
    return this.fn.constructor?.name === "AsyncFunction";
  }

  private handleCheckResult(
    checkRes: unknown,
    val: TOutput,
    ctx: ValidationContext,
    initialIssueCount: number,
  ): ValidationResult<TOutput> | null {
    if (checkRes === false) {
      return ctx.fail({ code: "custom", message: "Check failed", path: ctx.path, input: val });
    }
    if (typeof checkRes === "string") {
      return ctx.fail({ code: "custom", message: checkRes, path: ctx.path, input: val });
    }

    const contextIssues = (ctx as { issues?: ValidationIssue[] }).issues;
    if (contextIssues && contextIssues.length > initialIssueCount) {
      const newIssues = contextIssues.slice(initialIssueCount);
      if (newIssues.length === 1 && newIssues[0]) {
        return ctx.fail(newIssues[0]);
      }
      return ctx.fail({
        code: newIssues[0]?.code ?? "custom",
        message: newIssues[0]?.message ?? "Validation check failed",
        path: newIssues[0]?.path ?? ctx.path,
        issues: newIssues,
      });
    }

    return null;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
    const res = runValidator(this.inner, input, ctx);
    if (!res.ok) {
      return res;
    }

    const initialIssueCount = (ctx as { issues?: ValidationIssue[] }).issues?.length ?? 0;

    let checkRes: unknown;
    try {
      checkRes = this.fn(res.value, ctx);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Check failed";
      return ctx.fail({ code: "custom", message, path: ctx.path, input: res.value });
    }

    if (
      checkRes instanceof Promise ||
      (typeof checkRes === "object" && checkRes !== null && typeof (checkRes as Promise<unknown>).then === "function")
    ) {
      return ctx.fail({
        code: "custom",
        message: "Async check requires validateAsync()",
        path: ctx.path,
        input: res.value,
      });
    }

    const failure = this.handleCheckResult(checkRes, res.value, ctx, initialIssueCount);
    if (failure) {
      return failure;
    }

    return res;
  }

  protected override async _validateAsync(input: unknown, ctx: ValidationContext): Promise<ValidationResult<TOutput>> {
    const res = await runValidatorAsync(this.inner, input, ctx);
    if (!res.ok) {
      return res;
    }

    const initialIssueCount = (ctx as { issues?: ValidationIssue[] }).issues?.length ?? 0;

    let checkRes: unknown;
    try {
      const result = this.fn(res.value, ctx);
      if (
        result instanceof Promise ||
        (typeof result === "object" && result !== null && typeof (result as Promise<unknown>).then === "function")
      ) {
        checkRes = await result;
      } else {
        checkRes = result;
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Check failed";
      return ctx.fail({ code: "custom", message, path: ctx.path, input: res.value });
    }

    const failure = this.handleCheckResult(checkRes, res.value, ctx, initialIssueCount);
    if (failure) {
      return failure;
    }

    return res;
  }
}

/**
 * Modifier validator that transforms output values synchronously or asynchronously.
 */
class TransformValidator<TOutput, TNext, TInput> extends BaseValidator<TNext, TInput> {
  constructor(
    private readonly inner: Validator<TOutput, TInput>,
    private readonly fn: (val: TOutput) => TNext | Promise<TNext>,
    private readonly asyncMode = false,
  ) {
    super();
  }

  protected override isAsync(): boolean {
    return (
      this.asyncMode ||
      (this.inner instanceof BaseValidator ? (this.inner as unknown as { isAsync(): boolean }).isAsync() : false)
    );
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TNext> {
    if (this.asyncMode) {
      return ctx.fail({
        code: "custom",
        message: "Async transform requires validateAsync()",
        path: ctx.path,
        input,
      });
    }

    const res = runValidator(this.inner, input, ctx);
    if (!res.ok) {
      return res;
    }

    let nextValue: TNext | Promise<TNext>;
    try {
      nextValue = this.fn(res.value);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Transformation failed";
      return ctx.fail({ code: "custom", message, path: ctx.path, input: res.value });
    }

    if (
      nextValue instanceof Promise ||
      (typeof nextValue === "object" &&
        nextValue !== null &&
        typeof (nextValue as unknown as Promise<unknown>).then === "function")
    ) {
      return ctx.fail({
        code: "custom",
        message: "Async transform requires validateAsync()",
        path: ctx.path,
        input: res.value,
      });
    }

    return ctx.ok(nextValue as TNext);
  }

  protected override async _validateAsync(input: unknown, ctx: ValidationContext): Promise<ValidationResult<TNext>> {
    const res = await runValidatorAsync(this.inner, input, ctx);
    if (!res.ok) {
      return res;
    }

    try {
      const nextValue = await this.fn(res.value);
      return ctx.ok(nextValue);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Transformation failed";
      return ctx.fail({ code: "custom", message, path: ctx.path, input: res.value });
    }
  }
}

/**
 * Modifier validator that feeds output into another validator.
 */
class PipeValidator<TOutput, TNext, TInput> extends BaseValidator<TNext, TInput> {
  constructor(
    private readonly inner: Validator<TOutput, TInput>,
    private readonly nextValidator: Validator<TNext, unknown>,
  ) {
    super();
  }

  protected override isAsync(): boolean {
    const innerAsync =
      this.inner instanceof BaseValidator ? (this.inner as unknown as { isAsync(): boolean }).isAsync() : false;
    const nextAsync =
      this.nextValidator instanceof BaseValidator
        ? (this.nextValidator as unknown as { isAsync(): boolean }).isAsync()
        : false;
    return innerAsync || nextAsync;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TNext> {
    const res = runValidator(this.inner, input, ctx);
    if (!res.ok) {
      return res;
    }

    return runValidator(this.nextValidator, res.value, ctx);
  }

  protected override async _validateAsync(input: unknown, ctx: ValidationContext): Promise<ValidationResult<TNext>> {
    const res = await runValidatorAsync(this.inner, input, ctx);
    if (!res.ok) {
      return res;
    }

    return runValidatorAsync(this.nextValidator, res.value, ctx);
  }
}

/**
 * Infers the output type of a validator.
 *
 * @example
 * ```ts
 * const schema = val.string();
 * type Username = Infer<typeof schema>; // string
 * ```
 */
export type Infer<T> = T extends { readonly _output?: infer O }
  ? [T] extends [Validator<infer ActualOutput, unknown>]
    ? ActualOutput
    : O
  : never;

/**
 * Infers the accepted input type of a validator.
 *
 * @example
 * ```ts
 * const schema = val.string().optional();
 * type Input = InferInput<typeof schema>; // unknown | undefined
 * ```
 */
export type InferInput<T> = T extends { readonly _input?: infer I }
  ? [T] extends [Validator<unknown, infer ActualInput>]
    ? ActualInput
    : I
  : never;
