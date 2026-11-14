import { leaf } from "../core/leaf";
import { toValidator } from "../core/make";
import { assertBounds, assertOption } from "../core/result";
import { report } from "../core/run";
import { split } from "../core/split";
import type { Factory, Message, MessageOptions } from "../core/types";
import { SIZE_WORDS } from "../core/words";

/** Constraints for {@link bigint}. Every option is optional. */
export interface BigintOptions extends MessageOptions {
  /** Requires a value of at least this. */
  min?: bigint | undefined;
  /** Requires a value of at most this. */
  max?: bigint | undefined;
  /** Requires a value strictly greater than this. */
  gt?: bigint | undefined;
  /** Requires a value strictly less than this. */
  lt?: bigint | undefined;
}

// The bound is written as its decimal digits, since `JSON.stringify` throws on a bigint, and an issue is
// data a server sends. `type: "bigint"` says what the digits are.
const outOfRange = (side: "min" | "max", bound: bigint, isInclusive: boolean, message: Message | undefined): unknown =>
  report(
    side === "min" ? "too_small" : "too_big",
    {
      [side === "min" ? "minimum" : "maximum"]: String(bound),
      inclusive: isInclusive,
      type: "bigint",
    },
    message,
  );

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
  const [options, checks] = split<BigintOptions, bigint>(args, "min max gt lt");
  const { min, max, gt, lt, message } = options;
  for (const [name, bound] of Object.entries({ min, max, gt, lt })) {
    assertOption(name, bound, "bigint");
  }
  assertBounds(options);
  if (gt !== undefined && lt !== undefined && lt - gt <= 1n) {
    throw new RangeError(`No bigint lies between gt ${gt} and lt ${lt}`);
  }
  return toValidator(
    leaf<bigint>("bigint", isBigint, message, checks, (value) => {
      if (min !== undefined && value < min) {
        outOfRange("min", min, true, message);
      }
      if (gt !== undefined && value <= gt) {
        outOfRange("min", gt, false, message);
      }
      if (max !== undefined && value > max) {
        outOfRange("max", max, true, message);
      }
      if (lt !== undefined && value >= lt) {
        outOfRange("max", lt, false, message);
      }
      return value;
    }),
    { kind: "bigint", options, checks },
    SIZE_WORDS,
  );
}) as Factory<bigint, BigintOptions>;
