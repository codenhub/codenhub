import { describe } from "../core/describe";
import type { Factory } from "../core/types";
import { bigint, type BigintOptions } from "../primitives/bigint";
import { coercing } from "./coerce";

const DECIMAL_INTEGER_PATTERN = /^[+-]?\d+$/;

// The sign and any leading zeros, which do not count among the digits a bound is compared with. It is
// tested apart from the digits: `0*\d+` in one pattern backtracks on a long run of zeros that then fails.
const LEADING_PATTERN = /^[+-]?0*/;

/**
 * Creates a validator for bigints that also accepts safe integers and text holding a decimal integer,
 * converting them, then applies the same constraints as {@link bigint}.
 *
 * @remarks
 * Fractions, numbers beyond `Number.MAX_SAFE_INTEGER` (which have already lost precision), other text,
 * booleans and `null` are rejected. A value that cannot be converted fails with `invalid_type` and
 * `coerced: true` in `params`. Text with more digits than every bound has is refused by the bound on its
 * side before it is converted, since converting takes longer than linear time in the length of the text.
 *
 * @example
 * ```ts
 * coerceBigint({ gt: 0n })("12345678901234567890"); // { ok: true, value: 12345678901234567890n }
 * coerceBigint()(1.5); // { ok: false, ... }, code "invalid_type"
 * ```
 *
 * @param options - Bounds, exactly as for `bigint`.
 * @returns A validator that produces a bigint.
 * @throws {TypeError} When a bound is not a bigint, such as the number `0` where `0n` was meant.
 * @throws {RangeError} When no bigint can satisfy the bounds together.
 */
export const coerceBigint = ((...args: unknown[]) => {
  const strict = bigint(...(args as []));
  // The bounds the strict validator copied, so a getter in the options cannot give the shortcut others.
  const { min, max, gt, lt }: BigintOptions = describe(strict)?.options ?? {};
  const bounds = [min, max, gt, lt].filter((bound) => bound !== undefined);
  // A number of more digits than every bound lies beyond all of them, as this power of ten does, so it
  // fails the bounds this one fails, and is never converted: 8,000,000 digits took 1.5 s.
  const width = Math.max(0, ...bounds.map((bound) => String(bound < 0n ? -bound : bound).length));
  const beyond = 10n ** BigInt(width);
  return coercing("bigint", strict, args, (input) => {
    if (typeof input === "bigint") {
      return [input];
    }
    if (typeof input === "number" && Number.isSafeInteger(input)) {
      return [BigInt(input)];
    }
    const text = typeof input === "string" ? input.trim() : "";
    if (!DECIMAL_INTEGER_PATTERN.test(text)) {
      return undefined;
    }
    const digits = text.length - (LEADING_PATTERN.exec(text)?.[0].length ?? 0);
    const isNegative = text.startsWith("-");
    const isBounded = isNegative ? min !== undefined || gt !== undefined : max !== undefined || lt !== undefined;
    return [isBounded && digits > width ? (isNegative ? -beyond : beyond) : BigInt(text)];
  });
}) as Factory<bigint, BigintOptions, bigint | number | string>;
