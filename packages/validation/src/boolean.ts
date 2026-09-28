import { BaseValidator, type ValidationContext } from "./core";
import { describeReceived, type ValidationIssue, type ValidationResult } from "./result";

type BooleanCheck = (value: boolean, ctx: ValidationContext) => ValidationIssue | undefined;

/**
 * Validates boolean inputs against boolean-specific constraints.
 */
export class BooleanValidator extends BaseValidator<boolean, unknown> {
  protected readonly checks: BooleanCheck[] = [];

  protected clone(): BooleanValidator {
    const copy = new (this.constructor as new () => BooleanValidator)();
    copy.checks.push(...this.checks);
    return copy;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<boolean> {
    if (typeof input !== "boolean") {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected boolean, got ${describeReceived(input)}`,
        expected: "boolean",
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

    if (localIssues.length > 0) {
      const firstIssue = localIssues[0];
      if (localIssues.length === 1 && firstIssue) {
        return ctx.fail(firstIssue);
      }
      return ctx.fail({
        code: firstIssue?.code ?? "invalid_value",
        message: firstIssue?.message ?? "Boolean validation failed",
        path: ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(input);
  }

  /**
   * Enforces that the boolean value is strictly `true`.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  true(message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (val !== true) {
        return {
          code: "invalid_value",
          message: message ?? "Must be true",
          path: ctx.path,
          expected: "true",
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }

  /**
   * Enforces that the boolean value is strictly `false`.
   *
   * @param message - Optional custom failure message.
   * @returns This validator instance for method chaining.
   */
  false(message?: string): this {
    const copy = this.clone();
    copy.checks.push((val, ctx) => {
      if (val !== false) {
        return {
          code: "invalid_value",
          message: message ?? "Must be false",
          path: ctx.path,
          expected: "false",
          received: String(val),
          input: val,
        };
      }
      return undefined;
    });
    return copy as this;
  }
}

/**
 * Creates a {@link BooleanValidator} schema instance.
 *
 * @returns A new BooleanValidator instance.
 */
export function boolean(): BooleanValidator {
  return new BooleanValidator();
}
