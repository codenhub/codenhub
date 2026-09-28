import { BaseValidator, type ValidationContext } from "./core";
import { describeReceived, type ValidationIssue, type ValidationResult } from "./result";

/** Step execution function used within {@link NumberValidator}. */
export type NumberStep = (value: number, ctx: ValidationContext) => { nextValue: number; issue?: ValidationIssue };

/**
 * Validates numeric inputs against mathematical and structural constraints.
 */
export class NumberValidator extends BaseValidator<number, unknown> {
  protected readonly steps: NumberStep[] = [];
  protected allowNonFinite = false;

  protected clone(): NumberValidator {
    const copy = new (this.constructor as new () => NumberValidator)();
    copy.steps.push(...this.steps);
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

    let current = input;
    const localIssues: ValidationIssue[] = [];

    for (const step of this.steps) {
      const result = step(current, ctx);
      current = result.nextValue;

      if (result.issue !== undefined) {
        localIssues.push(result.issue);
        ctx.addIssue(result.issue);
        if (ctx.options.abortEarly) {
          return ctx.fail(result.issue);
        }
      }
    }

    if (localIssues.length > 0) {
      const firstIssue = localIssues[0];
      if (localIssues.length === 1 && firstIssue) {
        return ctx.fail(firstIssue);
      }
      return ctx.fail({
        code: firstIssue?.code ?? "invalid_value",
        message: firstIssue?.message ?? "Number validation failed",
        path: ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(current);
  }

  /**
   * Transforms the validated number by clamping it between `min` and `max` bounds.
   *
   * @param min - Lower clamp boundary (finite number).
   * @param max - Upper clamp boundary (finite number).
   * @returns This validator instance for method chaining.
   */
  clamp(min: number, max: number): this {
    const copy = this.clone();
    copy.steps.push((val, ctx) => {
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Clamp bounds must be finite numbers and min <= max",
            path: ctx.path,
          },
        };
      }
      return { nextValue: Math.min(Math.max(val, min), max) };
    });
    return copy as this;
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
    copy.steps.push((val, ctx) => {
      if (!Number.isFinite(limit)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Limit must be a finite number",
            path: ctx.path,
          },
        };
      }
      if (val <= limit) {
        return {
          nextValue: val,
          issue: {
            code: "too_small",
            message: message ?? `Must be greater than ${limit}`,
            path: ctx.path,
            expected: `greater than ${limit}`,
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (!Number.isFinite(limit)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Limit must be a finite number",
            path: ctx.path,
          },
        };
      }
      if (val < limit) {
        return {
          nextValue: val,
          issue: {
            code: "too_small",
            message: message ?? `Must be at least ${limit}`,
            path: ctx.path,
            expected: `at least ${limit}`,
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (!Number.isFinite(limit)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Limit must be a finite number",
            path: ctx.path,
          },
        };
      }
      if (val >= limit) {
        return {
          nextValue: val,
          issue: {
            code: "too_big",
            message: message ?? `Must be less than ${limit}`,
            path: ctx.path,
            expected: `less than ${limit}`,
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (!Number.isFinite(limit)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Limit must be a finite number",
            path: ctx.path,
          },
        };
      }
      if (val > limit) {
        return {
          nextValue: val,
          issue: {
            code: "too_big",
            message: message ?? `Must be at most ${limit}`,
            path: ctx.path,
            expected: `at most ${limit}`,
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (bounds.min !== undefined && !Number.isFinite(bounds.min)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Range minimum must be a finite number",
            path: ctx.path,
          },
        };
      }
      if (bounds.max !== undefined && !Number.isFinite(bounds.max)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Range maximum must be a finite number",
            path: ctx.path,
          },
        };
      }
      if (bounds.min !== undefined && bounds.max !== undefined && bounds.min > bounds.max) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Range minimum cannot be greater than maximum",
            path: ctx.path,
          },
        };
      }
      if (bounds.min !== undefined && val < bounds.min) {
        return {
          nextValue: val,
          issue: {
            code: "too_small",
            message: message ?? `Must be at least ${bounds.min}`,
            path: ctx.path,
            expected: `at least ${bounds.min}`,
            received: String(val),
            input: val,
          },
        };
      }
      if (bounds.max !== undefined && val > bounds.max) {
        return {
          nextValue: val,
          issue: {
            code: "too_big",
            message: message ?? `Must be at most ${bounds.max}`,
            path: ctx.path,
            expected: `at most ${bounds.max}`,
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (!Number.isInteger(val)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: message ?? "Must be an integer",
            path: ctx.path,
            expected: "integer",
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (!Number.isSafeInteger(val)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: message ?? "Must be a safe integer",
            path: ctx.path,
            expected: "safe integer",
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (val <= 0) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: message ?? "Must be a positive number",
            path: ctx.path,
            expected: "positive number",
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (val >= 0) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: message ?? "Must be a negative number",
            path: ctx.path,
            expected: "negative number",
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (val < 0) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: message ?? "Must be zero or greater",
            path: ctx.path,
            expected: "zero or greater",
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (val > 0) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: message ?? "Must be zero or less",
            path: ctx.path,
            expected: "zero or less",
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (val === 0) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: message ?? "Must not be zero",
            path: ctx.path,
            expected: "non-zero number",
            received: "0",
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (!Number.isFinite(step) || step <= 0) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: "Step must be a positive finite number",
            path: ctx.path,
          },
        };
      }
      const remainder = val % step;
      const isMultiple = Math.abs(remainder) < 1e-10 || Math.abs(Math.abs(remainder) - step) < 1e-10;
      if (!isMultiple) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: message ?? `Must be a multiple of ${step}`,
            path: ctx.path,
            expected: `multiple of ${step}`,
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (!Number.isInteger(val) || val < 1 || val > 65535) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: message ?? "Must be a valid port number (1-65535)",
            path: ctx.path,
            expected: "integer from 1 to 65535",
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
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
    copy.steps.push((val, ctx) => {
      if (!Number.isFinite(val)) {
        return {
          nextValue: val,
          issue: {
            code: "invalid_value",
            message: message ?? "Must be a finite number",
            path: ctx.path,
            expected: "finite number",
            received: String(val),
            input: val,
          },
        };
      }
      return { nextValue: val };
    });
    return copy as this;
  }
}

/**
 * Creates a {@link NumberValidator} schema instance.
 *
 * @returns A new NumberValidator instance.
 */
export function number(): NumberValidator {
  return new NumberValidator();
}
