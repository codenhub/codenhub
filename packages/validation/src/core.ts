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
 * @template TOutput - The type produced when validation succeeds.
 * @template TInput - The input type accepted by this validator.
 */
export interface Validator<TOutput, TInput = unknown> {
  /** Phantom property holding the inferred output type. */
  readonly _output?: TOutput;
  /** Phantom property holding the inferred input type. */
  readonly _input?: TInput;

  /**
   * Validates input data against this schema.
   *
   * @param input - Data to validate.
   * @param options - Optional validation configuration.
   * @returns A discriminated validation result (`ValidationOk` or `ValidationErr`).
   */
  validate(input: TInput, options?: ValidationOptions): ValidationResult<TOutput>;

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
   * Appends a custom refinement predicate to this validator.
   *
   * @param predicate - Predicate function returning `true` when output is valid.
   * @param error - Optional error message or options used if the predicate fails.
   * @returns A refined validator.
   */
  refine(predicate: (val: TOutput) => boolean, error?: string | ValidationErrorOptions): Validator<TOutput, TInput>;

  /**
   * Transforms the successfully validated output to a new value or type.
   *
   * @param fn - Pure transformation function.
   * @returns A validator outputting the transformed value.
   */
  transform<TNext>(fn: (val: TOutput) => TNext): Validator<TNext, TInput>;

  /**
   * Pipes the output of this validator into another validator.
   *
   * @param next - Validator to run on the output.
   * @returns A combined pipeline validator.
   */
  pipe<TNext, TNextInput = TOutput>(next: Validator<TNext, TNextInput>): Validator<TNext, TInput>;
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
      issue.path.length >= this.path.length && this.path.every((segment, idx) => issue.path[idx] === segment)
        ? issue.path
        : [...this.path, ...issue.path];

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
 * Abstract base class for all validators providing composable modifiers.
 *
 * Subclasses implement `_validate(input, ctx)` for type-specific checks.
 *
 * @template TOutput - The type produced when validation succeeds.
 * @template TInput - The input type accepted by this validator.
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
   * Validates an input against this validator's rules.
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
   * Appends a custom refinement predicate to this validator.
   *
   * @param predicate - Predicate function returning `true` when output is valid.
   * @param error - Optional error message or options used if the predicate fails.
   * @returns A refined validator.
   */
  refine(predicate: (val: TOutput) => boolean, error?: string | ValidationErrorOptions): Validator<TOutput, TInput> {
    return new RefineValidator(this, predicate, error);
  }

  /**
   * Transforms the successfully validated output to a new value or type.
   *
   * @param fn - Pure transformation function.
   * @returns A validator outputting the transformed value.
   */
  transform<TNext>(fn: (val: TOutput) => TNext): Validator<TNext, TInput> {
    return new TransformValidator(this, fn);
  }

  /**
   * Pipes the output of this validator into another validator.
   *
   * @param next - Validator to run on the output.
   * @returns A combined pipeline validator.
   */
  pipe<TNext, TNextInput = TOutput>(next: Validator<TNext, TNextInput>): Validator<TNext, TInput> {
    return new PipeValidator(this, next as unknown as Validator<TNext, unknown>);
  }
}

/**
 * Modifier validator that accepts `undefined`.
 */
class OptionalValidator<TOutput, TInput> extends BaseValidator<TOutput | undefined, TInput | undefined> {
  constructor(private readonly inner: Validator<TOutput, TInput>) {
    super();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput | undefined> {
    if (input === undefined) {
      return ctx.ok(undefined);
    }
    return runValidator(this.inner, input, ctx);
  }
}

/**
 * Modifier validator that accepts `null`.
 */
class NullableValidator<TOutput, TInput> extends BaseValidator<TOutput | null, TInput | null> {
  constructor(private readonly inner: Validator<TOutput, TInput>) {
    super();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput | null> {
    if (input === null) {
      return ctx.ok(null);
    }
    return runValidator(this.inner, input, ctx);
  }
}

/**
 * Modifier validator that accepts `null` or `undefined`.
 */
class NullishValidator<TOutput, TInput> extends BaseValidator<TOutput | null | undefined, TInput | null | undefined> {
  constructor(private readonly inner: Validator<TOutput, TInput>) {
    super();
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

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
    if (input === undefined) {
      const defaultValue = typeof this.fallback === "function" ? (this.fallback as () => TOutput)() : this.fallback;
      return ctx.ok(defaultValue);
    }
    return runValidator(this.inner, input, ctx);
  }
}

/**
 * Modifier validator that enforces an arbitrary predicate check on validated output.
 */
class RefineValidator<TOutput, TInput> extends BaseValidator<TOutput, TInput> {
  constructor(
    private readonly inner: Validator<TOutput, TInput>,
    private readonly predicate: (val: TOutput) => boolean,
    private readonly error?: string | ValidationErrorOptions,
  ) {
    super();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
    const res = runValidator(this.inner, input, ctx);
    if (!res.ok) {
      return res;
    }

    let isValid = false;
    try {
      isValid = this.predicate(res.value);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Refinement check failed";
      return ctx.fail({ code: "custom", message, path: ctx.path, input: res.value });
    }

    if (!isValid) {
      if (typeof this.error === "string") {
        return ctx.fail({ code: "custom", message: this.error, path: ctx.path, input: res.value });
      }
      if (this.error !== undefined) {
        return ctx.fail({
          code: "custom",
          ...this.error,
          path: this.error.path ?? ctx.path,
          input: "input" in this.error ? this.error.input : res.value,
        });
      }
      return ctx.fail({
        code: "custom",
        message: "Failed refinement predicate",
        path: ctx.path,
        input: res.value,
      });
    }

    return res;
  }
}

/**
 * Modifier validator that transforms output values.
 */
class TransformValidator<TOutput, TNext, TInput> extends BaseValidator<TNext, TInput> {
  constructor(
    private readonly inner: Validator<TOutput, TInput>,
    private readonly fn: (val: TOutput) => TNext,
  ) {
    super();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TNext> {
    const res = runValidator(this.inner, input, ctx);
    if (!res.ok) {
      return res;
    }

    try {
      const nextValue = this.fn(res.value);
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

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TNext> {
    const res = runValidator(this.inner, input, ctx);
    if (!res.ok) {
      return res;
    }

    return runValidator(this.nextValidator, res.value, ctx);
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
