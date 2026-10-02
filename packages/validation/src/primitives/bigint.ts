import { leaf, split } from "../core/checks";
import { assertBounds, assertOption, issue } from "../core/result";
import type { Factory, MessageOptions, ValidationIssue } from "../core/types";

/** Constraints for {@link bigint}. Every option is optional. */
export interface BigintOptions extends MessageOptions {
  /** Requires a value of at least this. */
  min?: bigint;
  /** Requires a value of at most this. */
  max?: bigint;
  /** Requires a value strictly greater than this. */
  gt?: bigint;
  /** Requires a value strictly less than this. */
  lt?: bigint;
}

// The bound is written as its decimal digits, since `JSON.stringify` throws on a bigint, and an issue is
// data a server sends. `type: "bigint"` says what the digits are.
const outOfRange = (side: "min" | "max", bound: bigint, isInclusive: boolean): ValidationIssue =>
  issue(side === "min" ? "too_small" : "too_big", {
    [side === "min" ? "minimum" : "maximum"]: String(bound),
    inclusive: isInclusive,
    type: "bigint",
  });

const isBigint = (input: unknown): boolean => typeof input === "bigint";

/**
 * Creates a validator for bigints. Numbers are rejected, including whole ones. A bound in an issue's
 * `params` is written as its decimal digits, `"10"` for `10n`, so the issue can be sent as JSON.
 *
 * @example
 * ```ts
 * const id = bigint({ gt: 0n });
 * id(10n); // { ok: true, value: 10n }
 * id(0n); // { ok: false, ... }, code "too_small"
 * ```
 *
 * @param options - Bounds to apply. Positive is `gt: 0n`, non-negative is `min: 0n`, negative is `lt: 0n`.
 * @throws {TypeError} When a bound is not a bigint, such as the number `0` where `0n` was meant.
 * @throws {RangeError} When no bigint can satisfy the bounds together.
 */
export const bigint = ((...args: unknown[]) => {
  const [options, checks] = split<BigintOptions, bigint>(args);
  const { min, max, gt, lt, message } = options;
  for (const [name, bound] of Object.entries({ min, max, gt, lt })) {
    assertOption(name, bound, "bigint");
  }
  assertBounds(options);
  if (gt !== undefined && lt !== undefined && lt - gt <= 1n) {
    throw new RangeError(`No bigint lies between gt ${gt} and lt ${lt}`);
  }
  return leaf<bigint>("bigint", isBigint, message, checks, (value, issues) => {
    if (min !== undefined && value < min) {
      issues.push(outOfRange("min", min, true));
    }
    if (gt !== undefined && value <= gt) {
      issues.push(outOfRange("min", gt, false));
    }
    if (max !== undefined && value > max) {
      issues.push(outOfRange("max", max, true));
    }
    if (lt !== undefined && value >= lt) {
      issues.push(outOfRange("max", lt, false));
    }
    return value;
  });
}) as Factory<bigint, BigintOptions>;
