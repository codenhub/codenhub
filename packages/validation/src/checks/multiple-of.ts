import { rule } from "../core/checks";
import type { Check, Message } from "../core/types";

/** A number's shortest text as whole digits and a power of ten: 0.35 is 35 and -2, 1e-7 is 1 and -7. */
const toDecimal = (value: number): { digits: bigint; exponent: number } => {
  const [mantissa = "0", exponent = "0"] = value.toExponential().split("e");
  const [whole = "0", fraction = ""] = mantissa.split(".");
  return { digits: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
};

const isMultipleOf = (value: number, step: number): boolean => {
  // A safe integer is written as the number it holds, and `%` is exact, so it is compared as it is.
  if (Number.isSafeInteger(value) && Number.isSafeInteger(step)) {
    return value % step === 0;
  }
  // Otherwise both are read as the decimals they are written as, scaled to whole numbers with the same
  // power of ten, so 0.3 is a multiple of 0.1, 1e16 is not one of 0.3, and 1e23 is one of 10, though the
  // double it is held as is not.
  const left = toDecimal(value);
  const right = toDecimal(step);
  const exponent = Math.min(left.exponent, right.exponent);
  const scale = (decimal: { digits: bigint; exponent: number }): bigint =>
    decimal.digits * 10n ** BigInt(decimal.exponent - exponent);
  return scale(left) % scale(right) === 0n;
};

/**
 * Requires a number that is a multiple of a step.
 *
 * @remarks
 * Both are compared as the decimals they are written as, so `0.3` is a multiple of `0.1` at any size. A
 * value computed in floating point, such as `0.1 + 0.2`, is compared as the number it actually is,
 * `0.30000000000000004`. It fails with `invalid_value` and `params` `{ type: "number", format: "multipleOf", value }`, the
 * `value` being the step.
 *
 * @example
 * ```ts
 * number(multipleOf(0.01, "At most two decimals"));
 * ```
 *
 * @param step - A positive finite number.
 * @param message - Wording for the issue.
 * @returns A check of numbers.
 * @throws {TypeError} When `step` is not a number.
 * @throws {RangeError} When `step` is not a positive finite number.
 */
export function multipleOf(step: number, message?: Message): Check<number> {
  if (typeof step !== "number") {
    throw new TypeError(`multipleOf needs a number, received ${step === null ? "null" : typeof step}`);
  }
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError(`multipleOf needs a positive finite number, received ${step}`);
  }
  return rule(
    (value) => isMultipleOf(value, step),
    "invalid_value",
    { type: "number", format: "multipleOf", value: step },
    message,
  );
}
