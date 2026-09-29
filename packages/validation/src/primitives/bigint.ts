import { assertBounds, failWith, invalidType, pass, toIssue } from "../core/result";
import type { ValidationIssue, Validator } from "../core/types";

/** Constraints for {@link bigint}. Every option is optional. */
export interface BigintOptions {
  /** Requires a value of at least this. */
  min?: bigint;
  /** Requires a value of at most this. */
  max?: bigint;
  /** Requires a value strictly greater than this. */
  gt?: bigint;
  /** Requires a value strictly less than this. */
  lt?: bigint;
}

const outOfRange = (side: "min" | "max", bound: bigint, isInclusive: boolean): ValidationIssue =>
  toIssue({
    code: side === "min" ? "too_small" : "too_big",
    params: { [side === "min" ? "minimum" : "maximum"]: bound, inclusive: isInclusive, type: "bigint" },
  });

/**
 * Creates a validator for bigints. Numbers are rejected, including whole ones.
 *
 * @example
 * ```ts
 * const id = bigint({ gt: 0n });
 * id(10n); // { ok: true, value: 10n }
 * id(0n); // { ok: false, ... }, code "too_small"
 * ```
 *
 * @param options - Bounds to apply. Positive is `gt: 0n`, non-negative is `min: 0n`, negative is `lt: 0n`.
 * @returns A validator that produces a bigint.
 * @throws {RangeError} When no bigint can satisfy the bounds together.
 */
export function bigint(options: BigintOptions = {}): Validator<bigint> {
  const { min, max, gt, lt } = options;
  assertBounds(options);
  return (input) => {
    if (typeof input !== "bigint") {
      return invalidType("bigint", input);
    }
    const issues: ValidationIssue[] = [];
    if (min !== undefined && input < min) {
      issues.push(outOfRange("min", min, true));
    }
    if (gt !== undefined && input <= gt) {
      issues.push(outOfRange("min", gt, false));
    }
    if (max !== undefined && input > max) {
      issues.push(outOfRange("max", max, true));
    }
    if (lt !== undefined && input >= lt) {
      issues.push(outOfRange("max", lt, false));
    }
    return issues.length > 0 ? failWith(issues) : pass(input);
  };
}
