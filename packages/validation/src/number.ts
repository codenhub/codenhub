import { BaseValidator, type ValidationContext } from "./core";
import {
  describeReceived,
  fail,
  ok,
  type ValidationIssue,
  type ValidationOptions,
  type ValidationResult,
} from "./result";

type NumberCheck = (value: number, ctx: ValidationContext) => ValidationIssue | undefined;

/**
 * Validates numeric inputs against mathematical and structural constraints.
 */
export class NumberValidator extends BaseValidator<number, unknown> {
  private readonly checks: NumberCheck[] = [];
  private allowNonFinite = false;

  protected clone(): NumberValidator {
    const copy = new NumberValidator();
    copy.checks.push(...this.checks);
    copy.allowNonFinite = this.allowNonFinite;
    return copy;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<number> {
    if (typeof input !== "number" || Number.isNaN(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected number, got ${describeReceived(input)}`,
        expected: "number",
        received: describeReceived(input),
        input,
      });
    }

    if (!this.allowNonFinite && !Number.isFinite(input)) {
      return ctx.fail({
        code: "invalid_value",
        message: "Must be a finite number",
        expected: "finite number",
        received: String(input),
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

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Number validation failed",
        path: ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(input);
  }

  /**
   * Enforces a minimum value (inclusive).
   *
   * @param min - Minimum acceptable value.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  min(min: number, message?: string): this {
    return this.gte(min, message);
  }

  /**
   * Enforces a maximum value (inclusive).
   *
   * @param max - Maximum acceptable value.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  max(max: number, message?: string): this {
    return this.lte(max, message);
  }

  /**
   * Enforces that the number is strictly greater than the limit (`> limit`).
   *
   * @param limit - Lower threshold boundary.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  gt(limit: number, message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (!Number.isFinite(limit)) {
        return {
          code: "invalid_value",
          message: "Limit must be a finite number",
          path: ctx.path,
        };
      }
      if (val <= limit) {
        return {
          code: "too_small",
          message: message ?? `Must be greater than ${limit}`,
          path: ctx.path,
          expected: `greater than ${limit}`,
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is greater than or equal to the limit (`>= limit`).
   *
   * @param limit - Lower inclusive boundary.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  gte(limit: number, message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (!Number.isFinite(limit)) {
        return {
          code: "invalid_value",
          message: "Limit must be a finite number",
          path: ctx.path,
        };
      }
      if (val < limit) {
        return {
          code: "too_small",
          message: message ?? `Must be at least ${limit}`,
          path: ctx.path,
          expected: `at least ${limit}`,
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is strictly less than the limit (`< limit`).
   *
   * @param limit - Upper threshold boundary.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  lt(limit: number, message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (!Number.isFinite(limit)) {
        return {
          code: "invalid_value",
          message: "Limit must be a finite number",
          path: ctx.path,
        };
      }
      if (val >= limit) {
        return {
          code: "too_big",
          message: message ?? `Must be less than ${limit}`,
          path: ctx.path,
          expected: `less than ${limit}`,
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is less than or equal to the limit (`<= limit`).
   *
   * @param limit - Upper inclusive boundary.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  lte(limit: number, message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (!Number.isFinite(limit)) {
        return {
          code: "invalid_value",
          message: "Limit must be a finite number",
          path: ctx.path,
        };
      }
      if (val > limit) {
        return {
          code: "too_big",
          message: message ?? `Must be at most ${limit}`,
          path: ctx.path,
          expected: `at most ${limit}`,
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces inclusive bounds on the numeric value.
   *
   * @param bounds - Object specifying optional `min` and `max` bounds.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  range(bounds: { min?: number; max?: number }, message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (bounds.min !== undefined && !Number.isFinite(bounds.min)) {
        return {
          code: "invalid_value",
          message: "Range minimum must be a finite number",
          path: ctx.path,
        };
      }
      if (bounds.max !== undefined && !Number.isFinite(bounds.max)) {
        return {
          code: "invalid_value",
          message: "Range maximum must be a finite number",
          path: ctx.path,
        };
      }
      if (bounds.min !== undefined && bounds.max !== undefined && bounds.min > bounds.max) {
        return {
          code: "invalid_value",
          message: "Range minimum cannot be greater than maximum",
          path: ctx.path,
        };
      }
      if (bounds.min !== undefined && val < bounds.min) {
        return {
          code: "too_small",
          message: message ?? `Must be at least ${bounds.min}`,
          path: ctx.path,
          expected: `at least ${bounds.min}`,
          received: String(val),
          input: val,
        };
      }
      if (bounds.max !== undefined && val > bounds.max) {
        return {
          code: "too_big",
          message: message ?? `Must be at most ${bounds.max}`,
          path: ctx.path,
          expected: `at most ${bounds.max}`,
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is an integer.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  int(message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (!Number.isInteger(val)) {
        return {
          code: "invalid_value",
          message: message ?? "Must be an integer",
          path: ctx.path,
          expected: "integer",
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is a safe integer within `Number.MIN_SAFE_INTEGER` and `Number.MAX_SAFE_INTEGER`.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  safeInt(message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (!Number.isSafeInteger(val)) {
        return {
          code: "invalid_value",
          message: message ?? "Must be a safe integer",
          path: ctx.path,
          expected: "safe integer",
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is strictly positive (`> 0`).
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  positive(message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (val <= 0) {
        return {
          code: "invalid_value",
          message: message ?? "Must be a positive number",
          path: ctx.path,
          expected: "positive number",
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is strictly negative (`< 0`).
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  negative(message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (val >= 0) {
        return {
          code: "invalid_value",
          message: message ?? "Must be a negative number",
          path: ctx.path,
          expected: "negative number",
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is greater than or equal to zero (`>= 0`).
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  nonNegative(message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (val < 0) {
        return {
          code: "invalid_value",
          message: message ?? "Must be zero or greater",
          path: ctx.path,
          expected: "zero or greater",
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is less than or equal to zero (`<= 0`).
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  nonPositive(message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (val > 0) {
        return {
          code: "invalid_value",
          message: message ?? "Must be zero or less",
          path: ctx.path,
          expected: "zero or less",
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is not equal to zero (`!== 0`).
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  nonZero(message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (val === 0) {
        return {
          code: "invalid_value",
          message: message ?? "Must not be zero",
          path: ctx.path,
          expected: "non-zero number",
          received: "0",
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is a multiple of a given step.
   *
   * @param step - Divisor step (positive finite number).
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  multipleOf(step: number, message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (!Number.isFinite(step) || step <= 0) {
        return {
          code: "invalid_value",
          message: "Step must be a positive finite number",
          path: ctx.path,
        };
      }
      const remainder = val % step;
      const isMultiple = Math.abs(remainder) < 1e-10 || Math.abs(Math.abs(remainder) - step) < 1e-10;
      if (!isMultiple) {
        return {
          code: "invalid_value",
          message: message ?? `Must be a multiple of ${step}`,
          path: ctx.path,
          expected: `multiple of ${step}`,
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Validates that the number is a valid network port (integer from 1 to 65535).
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  port(message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (!Number.isInteger(val) || val < 1 || val > 65535) {
        return {
          code: "invalid_value",
          message: message ?? "Must be a valid port number (1-65535)",
          path: ctx.path,
          expected: "integer from 1 to 65535",
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the number is finite.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  finite(message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (!Number.isFinite(val)) {
        return {
          code: "invalid_value",
          message: message ?? "Must be a finite number",
          path: ctx.path,
          expected: "finite number",
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }
}

/** Legacy NumberValidators interface for backwards compatibility. */
export interface NumberValidators {
  /** Validates that the finite number is greater than zero. */
  positive(): ValidationResult<number>;
  /** Validates that the finite number is less than zero. */
  negative(): ValidationResult<number>;
  /** Validates that the finite number is zero or greater. */
  nonNegative(): ValidationResult<number>;
  /** Validates that the finite number is zero or less. */
  nonPositive(): ValidationResult<number>;
  /** Validates that the finite number is not zero. */
  nonZero(): ValidationResult<number>;
  /** Validates that the finite number is an integer. */
  int(): ValidationResult<number>;
  /** Validates that the finite number is a safe JavaScript integer. */
  safeInt(): ValidationResult<number>;
  /** Validates that the finite number is within optional inclusive min and max bounds. */
  range(options: { min?: number; max?: number }): ValidationResult<number>;
  /** Returns success for finite numbers; non-finite input fails before this method runs. */
  finite(): ValidationResult<number>;
  /** Validates that the finite number is an integer TCP/UDP port from 1 through 65535. */
  port(): ValidationResult<number>;
}

function createRejectedNumberValidators(reject: () => ValidationResult<number>): NumberValidators {
  return {
    positive: reject,
    negative: reject,
    nonNegative: reject,
    nonPositive: reject,
    nonZero: reject,
    int: reject,
    safeInt: reject,
    range: reject,
    finite: reject,
    port: reject,
  };
}

function legacyNumber(value: unknown, options: ValidationOptions = {}): NumberValidators {
  if (typeof value !== "number" || Number.isNaN(value)) {
    const typeError = fail(
      {
        code: "invalid_type",
        message: `Expected number, got ${describeReceived(value)}`,
        expected: "number",
        received: describeReceived(value),
        input: value,
      },
      options,
    );
    const reject = () => typeError;
    return createRejectedNumberValidators(reject);
  }

  if (!Number.isFinite(value)) {
    const finiteError = fail(
      {
        code: "invalid_value",
        message: "Must be a finite number",
        expected: "finite number",
        received: String(value),
        input: value,
      },
      options,
    );
    const reject = () => finiteError;
    return createRejectedNumberValidators(reject);
  }

  return {
    positive: () =>
      value > 0
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be a positive number",
              expected: "positive number",
              received: String(value),
            },
            options,
          ),
    negative: () =>
      value < 0
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be a negative number",
              expected: "negative number",
              received: String(value),
            },
            options,
          ),
    nonNegative: () =>
      value >= 0
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be zero or greater",
              expected: "zero or greater",
              received: String(value),
            },
            options,
          ),
    nonPositive: () =>
      value <= 0
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be zero or less",
              expected: "zero or less",
              received: String(value),
            },
            options,
          ),
    nonZero: () =>
      value !== 0
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must not be zero",
              expected: "non-zero number",
              received: "0",
            },
            options,
          ),
    int: () =>
      Number.isInteger(value)
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be an integer",
              expected: "integer",
              received: String(value),
            },
            options,
          ),
    safeInt: () =>
      Number.isSafeInteger(value)
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be a safe integer",
              expected: "safe integer",
              received: String(value),
            },
            options,
          ),
    range: ({ min, max }: { min?: number; max?: number }) => {
      if (min !== undefined && !Number.isFinite(min)) {
        return fail(
          {
            code: "invalid_value",
            message: "Range minimum must be a finite number",
          },
          options,
        );
      }
      if (max !== undefined && !Number.isFinite(max)) {
        return fail(
          {
            code: "invalid_value",
            message: "Range maximum must be a finite number",
          },
          options,
        );
      }
      if (min !== undefined && max !== undefined && min > max) {
        return fail(
          {
            code: "invalid_value",
            message: "Range minimum cannot be greater than maximum",
          },
          options,
        );
      }
      if (min !== undefined && value < min) {
        return fail(
          {
            code: "too_small",
            message: `Must be at least ${min}`,
            expected: `at least ${min}`,
            received: String(value),
          },
          options,
        );
      }
      if (max !== undefined && value > max) {
        return fail(
          {
            code: "too_big",
            message: `Must be at most ${max}`,
            expected: `at most ${max}`,
            received: String(value),
          },
          options,
        );
      }
      return ok(value);
    },
    finite: () => ok(value),
    port: () =>
      Number.isInteger(value) && value >= 1 && value <= 65535
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be a valid port number (1-65535)",
              expected: "integer from 1 to 65535",
              received: String(value),
            },
            options,
          ),
  };
}

/**
 * Creates a {@link NumberValidator} instance or evaluates legacy number checks.
 *
 * @returns A new NumberValidator when called with no arguments.
 */
export function number(): NumberValidator;
/**
 * Legacy number validator evaluation on an input value.
 *
 * @param value - Target value to validate.
 * @param options - Optional validation configuration.
 * @returns Object providing legacy number validation methods.
 */
export function number(value: unknown, options?: ValidationOptions): NumberValidators;
export function number(value?: unknown, options?: ValidationOptions): NumberValidator | NumberValidators {
  if (arguments.length === 0) {
    return new NumberValidator();
  }
  return legacyNumber(value, options);
}
