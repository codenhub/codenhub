import { BaseValidator, type ValidationContext } from "./core";
import { describeReceived, type ValidationIssue, type ValidationResult } from "./result";

type DateCheck = (value: Date, ctx: ValidationContext) => ValidationIssue | undefined;

/**
 * Validates Date instances against validity and chronological boundaries.
 */
export class DateValidator extends BaseValidator<Date, unknown> {
  private readonly checks: DateCheck[] = [];

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<Date> {
    if (!(input instanceof Date)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected Date, got ${describeReceived(input)}`,
        expected: "Date",
        received: describeReceived(input),
        input,
      });
    }

    if (Number.isNaN(input.getTime())) {
      return ctx.fail({
        code: "invalid_value",
        message: "Invalid Date",
        expected: "valid Date",
        received: "Invalid Date",
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
      const firstIssue = localIssues[0];
      if (localIssues.length === 1 && firstIssue) {
        return ctx.fail(firstIssue);
      }
      return ctx.fail({
        code: firstIssue?.code ?? "invalid_value",
        message: firstIssue?.message ?? "Date validation failed",
        path: ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(input);
  }

  /**
   * Enforces that the date is chronologically after or on the specified boundary.
   *
   * @param minDate - Minimum acceptable Date boundary.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  min(minDate: Date, message?: string): this {
    this.checks.push((val, ctx) => {
      if (Number.isNaN(minDate.getTime())) {
        return {
          code: "invalid_value",
          message: "Minimum date bound must be a valid Date",
          path: ctx.path,
        };
      }
      if (val.getTime() < minDate.getTime()) {
        return {
          code: "too_small",
          message: message ?? `Date must be after or on ${minDate.toISOString()}`,
          path: ctx.path,
          expected: `>= ${minDate.toISOString()}`,
          received: val.toISOString(),
          input: val,
        };
      }
      return undefined;
    });
    return this;
  }

  /**
   * Enforces that the date is chronologically before or on the specified boundary.
   *
   * @param maxDate - Maximum acceptable Date boundary.
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  max(maxDate: Date, message?: string): this {
    this.checks.push((val, ctx) => {
      if (Number.isNaN(maxDate.getTime())) {
        return {
          code: "invalid_value",
          message: "Maximum date bound must be a valid Date",
          path: ctx.path,
        };
      }
      if (val.getTime() > maxDate.getTime()) {
        return {
          code: "too_big",
          message: message ?? `Date must be before or on ${maxDate.toISOString()}`,
          path: ctx.path,
          expected: `<= ${maxDate.toISOString()}`,
          received: val.toISOString(),
          input: val,
        };
      }
      return undefined;
    });
    return this;
  }
}

/**
 * Creates a {@link DateValidator} schema instance.
 *
 * @returns A new DateValidator instance.
 */
export function date(): DateValidator {
  return new DateValidator();
}
