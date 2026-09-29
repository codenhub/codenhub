import { failWith, invalidType, pass, toIssue } from "../core/result";
import type { ValidationIssue, Validator } from "../core/types";

/** Bounds for {@link date}. Every option is optional. */
export interface DateOptions {
  /** Requires this moment or a later one. Must be a valid `Date`. */
  min?: Date;
  /** Requires this moment or an earlier one. Must be a valid `Date`. */
  max?: Date;
}

const assertValidDate = (name: string, bound: Date | undefined): void => {
  if (bound !== undefined && Number.isNaN(bound.getTime())) {
    throw new RangeError(`${name} must be a valid Date`);
  }
};

/**
 * Creates a validator for valid `Date` objects. An invalid `Date` such as `new Date("nope")`, a
 * timestamp and a date string are all rejected; parse text with `isoDate` or convert it first.
 *
 * @example
 * ```ts
 * const birthday = date({ max: new Date() });
 * birthday(new Date("1990-04-01")); // { ok: true, ... }
 * birthday(new Date("nope")); // { ok: false, ... }, code "invalid_type"
 * ```
 *
 * @param options - Earliest and latest accepted moments, both inclusive.
 * @returns A validator that produces a `Date`.
 * @throws {RangeError} When `min` or `max` is an invalid `Date`.
 */
export function date(options: DateOptions = {}): Validator<Date> {
  const { min, max } = options;
  assertValidDate("Minimum date", min);
  assertValidDate("Maximum date", max);
  return (input) => {
    if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
      return invalidType("valid date", input);
    }
    const issues: ValidationIssue[] = [];
    if (min !== undefined && input.getTime() < min.getTime()) {
      issues.push(toIssue({ code: "too_small", params: { minimum: min, inclusive: true, type: "date" } }));
    }
    if (max !== undefined && input.getTime() > max.getTime()) {
      issues.push(toIssue({ code: "too_big", params: { maximum: max, inclusive: true, type: "date" } }));
    }
    return issues.length > 0 ? failWith(issues) : pass(input);
  };
}
