import { BaseValidator, type ValidationContext, type Validator } from "./core";
import {
  describeReceived,
  fail,
  ok,
  type ValidationIssue,
  type ValidationOptions,
  type ValidationResult,
} from "./result";

/** Array validators returned by legacy `val.array()`. */
export interface ArrayValidators<T> {
  /** Validates that the array contains at least `length` items. */
  minLength(length: number): ValidationResult<T[]>;
  /** Validates that the array contains at most `length` items. */
  maxLength(length: number): ValidationResult<T[]>;
  /** Validates that the array contains at least one item. */
  notEmpty(): ValidationResult<T[]>;
}

const isValidLengthLimit = (value: number): boolean => Number.isFinite(value) && value >= 0;

const isValidator = (value: unknown): value is Validator<unknown, unknown> => {
  return (
    value !== null && typeof value === "object" && typeof (value as { validate?: unknown }).validate === "function"
  );
};

type ArrayCheck = (input: unknown[], ctx: ValidationContext) => ValidationIssue | undefined;

/**
 * Schema validator for array structures and element validation.
 *
 * Supports length constraints, empty checks, and recursive element validation
 * with item-level path tracking.
 *
 * @typeParam TItem - The type of elements validated inside the array.
 */
export class ArrayValidator<TItem = unknown> extends BaseValidator<TItem[], unknown> {
  private readonly checks: ArrayCheck[] = [];

  /**
   * Constructs an ArrayValidator with an optional element validator schema.
   *
   * @param elementValidator - Optional validator applied to every element of the array.
   */
  constructor(private readonly elementValidator?: Validator<TItem>) {
    super();
  }

  /**
   * Returns the element validator schema if one was provided.
   */
  get element(): Validator<TItem> | undefined {
    return this.elementValidator;
  }

  /**
   * Enforces a minimum array length.
   *
   * @param length - Minimum number of elements (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  min(length: number, message?: string): this {
    this.checks.push((arr, ctx) => {
      if (!isValidLengthLimit(length)) {
        return {
          code: "invalid_value",
          message: "Minimum length must be a finite non-negative number",
          path: ctx.path,
        };
      }
      if (arr.length < length) {
        return {
          code: "too_small",
          message: message ?? `Must contain at least ${length} items`,
          path: ctx.path,
          expected: `at least ${length} items`,
          received: `${arr.length} items`,
          input: arr,
        };
      }
      return undefined;
    });
    return this;
  }

  /**
   * Enforces a maximum array length.
   *
   * @param length - Maximum number of elements (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  max(length: number, message?: string): this {
    this.checks.push((arr, ctx) => {
      if (!isValidLengthLimit(length)) {
        return {
          code: "invalid_value",
          message: "Maximum length must be a finite non-negative number",
          path: ctx.path,
        };
      }
      if (arr.length > length) {
        return {
          code: "too_big",
          message: message ?? `Must contain at most ${length} items`,
          path: ctx.path,
          expected: `at most ${length} items`,
          received: `${arr.length} items`,
          input: arr,
        };
      }
      return undefined;
    });
    return this;
  }

  /**
   * Enforces an exact array length.
   *
   * @param length - Exact required element count (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  length(length: number, message?: string): this {
    this.checks.push((arr, ctx) => {
      if (!isValidLengthLimit(length)) {
        return {
          code: "invalid_value",
          message: "Length must be a finite non-negative number",
          path: ctx.path,
        };
      }
      if (arr.length !== length) {
        return {
          code: "invalid_value",
          message: message ?? `Must contain exactly ${length} items`,
          path: ctx.path,
          expected: `${length} items`,
          received: `${arr.length} items`,
          input: arr,
        };
      }
      return undefined;
    });
    return this;
  }

  /**
   * Enforces that the array is not empty.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  nonEmpty(message?: string): this {
    this.checks.push((arr, ctx) => {
      if (arr.length === 0) {
        return {
          code: "too_small",
          message: message ?? "Array cannot be empty",
          path: ctx.path,
          expected: "non-empty array",
          received: "empty array",
          input: arr,
        };
      }
      return undefined;
    });
    return this;
  }

  /**
   * Alias for {@link ArrayValidator.min}.
   *
   * @param length - Minimum element count.
   * @param options - Optional configuration or custom error message string.
   * @returns This validator instance for method chaining.
   */
  minLength(length: number, options?: { message?: string } | string): this {
    const msg = typeof options === "string" ? options : options?.message;
    return this.min(length, msg);
  }

  /**
   * Alias for {@link ArrayValidator.max}.
   *
   * @param length - Maximum element count.
   * @param options - Optional configuration or custom error message string.
   * @returns This validator instance for method chaining.
   */
  maxLength(length: number, options?: { message?: string } | string): this {
    const msg = typeof options === "string" ? options : options?.message;
    return this.max(length, msg);
  }

  /**
   * Alias for {@link ArrayValidator.nonEmpty}.
   *
   * @param options - Optional configuration or custom error message string.
   * @returns This validator instance for method chaining.
   */
  notEmpty(options?: { message?: string } | string): this {
    const msg = typeof options === "string" ? options : options?.message;
    return this.nonEmpty(msg);
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TItem[]> {
    if (!Array.isArray(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected array, got ${describeReceived(input)}`,
        expected: "array",
        received: describeReceived(input),
        input,
      });
    }

    const localIssues: ValidationIssue[] = [];

    for (const check of this.checks) {
      const issue = check(input, ctx);
      if (issue !== undefined) {
        localIssues.push(issue);
        ctx.addIssue(issue);
        if (ctx.options.abortEarly) {
          return ctx.fail(issue);
        }
      }
    }

    const output: TItem[] = [];

    if (this.elementValidator !== undefined) {
      for (let i = 0; i < input.length; i++) {
        const item = input[i];
        const childPath = [...ctx.path, i];
        const res = this.elementValidator.validate(item as TItem, {
          ...ctx.options,
          path: childPath,
        });

        if (!res.ok) {
          if (res.error.issues && res.error.issues.length > 0) {
            for (const iss of res.error.issues) {
              localIssues.push(iss);
              ctx.addIssue(iss);
            }
          } else {
            localIssues.push(res.error);
            ctx.addIssue(res.error);
          }

          if (ctx.options.abortEarly) {
            return ctx.fail(localIssues[0]);
          }
        } else {
          output.push(res.value);
        }
      }
    }

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Array validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(this.elementValidator !== undefined ? output : (input as TItem[]));
  }
}

/** Legacy array validator implementation for 0.0.1 compatibility. */
function legacyArray<T = unknown>(value: unknown, options: ValidationOptions = {}): ArrayValidators<T> {
  if (!Array.isArray(value)) {
    const typeError = fail(
      {
        code: "invalid_type",
        message: `Expected array, got ${describeReceived(value)}`,
        expected: "array",
        received: describeReceived(value),
        input: value,
      },
      options,
    );
    const reject = () => typeError;

    return {
      minLength: reject,
      maxLength: reject,
      notEmpty: reject,
    };
  }

  const arrayValue = value as T[];

  return {
    minLength(length: number): ValidationResult<T[]> {
      if (!isValidLengthLimit(length)) {
        return fail({ code: "invalid_value", message: "Minimum length must be a finite non-negative number" }, options);
      }
      if (arrayValue.length < length) {
        return fail(
          {
            code: "too_small",
            message: `Must contain at least ${length} items`,
            expected: `at least ${length} items`,
            received: `${arrayValue.length} items`,
          },
          options,
        );
      }

      return ok(arrayValue);
    },

    maxLength(length: number): ValidationResult<T[]> {
      if (!isValidLengthLimit(length)) {
        return fail({ code: "invalid_value", message: "Maximum length must be a finite non-negative number" }, options);
      }
      if (arrayValue.length > length) {
        return fail(
          {
            code: "too_big",
            message: `Must contain at most ${length} items`,
            expected: `at most ${length} items`,
            received: `${arrayValue.length} items`,
          },
          options,
        );
      }

      return ok(arrayValue);
    },

    notEmpty(): ValidationResult<T[]> {
      if (arrayValue.length === 0) {
        return fail(
          { code: "too_small", message: "Array cannot be empty", expected: "non-empty array", received: "empty array" },
          options,
        );
      }

      return ok(arrayValue);
    },
  };
}

/**
 * Creates an array schema validator for elements matching the given item schema.
 *
 * @typeParam TItem - Element type validated by the child schema.
 * @param elementValidator - Optional validator schema applied to each element.
 * @returns A new ArrayValidator instance.
 */
export function array<TItem = unknown>(elementValidator?: Validator<TItem>): ArrayValidator<TItem>;
/**
 * Evaluates legacy array checks on an input value.
 *
 * @typeParam T - Target element type.
 * @param value - Value to validate.
 * @param options - Validation options.
 * @returns Object providing legacy validation methods.
 */
export function array<T = unknown>(value: unknown, options?: ValidationOptions): ArrayValidators<T>;
/**
 * Creates an array validator schema or evaluates legacy array checks.
 *
 * @param elementValidatorOrValue - Optional element validator schema or value to test.
 * @param options - Optional validation options.
 * @returns An ArrayValidator or legacy ArrayValidators.
 */
export function array<TItem = unknown>(
  elementValidatorOrValue?: unknown,
  options?: ValidationOptions,
): ArrayValidator<TItem> | ArrayValidators<TItem> {
  if (options !== undefined || arguments.length >= 2) {
    return legacyArray(elementValidatorOrValue, options);
  }

  if (arguments.length === 0) {
    return new ArrayValidator<TItem>();
  }

  if (isValidator(elementValidatorOrValue)) {
    return new ArrayValidator(elementValidatorOrValue as Validator<TItem>);
  }

  return legacyArray(elementValidatorOrValue, options);
}
