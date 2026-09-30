import type { Factory } from "../core/types";
import { bigint, type BigintOptions } from "../primitives/bigint";
import { coercing } from "./coerce";

const DECIMAL_INTEGER_PATTERN = /^[+-]?\d+$/;

/**
 * Creates a validator for bigints that also accepts safe integers and text holding a decimal integer,
 * converting them, then applies the same constraints as {@link bigint}.
 *
 * @remarks
 * Fractions, numbers beyond `Number.MAX_SAFE_INTEGER` (which have already lost precision), other text,
 * booleans and `null` are rejected. A value that cannot be converted fails with `invalid_type` and
 * `coerced: true` in `params`.
 *
 * @example
 * ```ts
 * coerceBigint({ gt: 0n })("12345678901234567890"); // { ok: true, value: 12345678901234567890n }
 * coerceBigint()(1.5); // { ok: false, ... }, code "invalid_type"
 * ```
 *
 * @param options - Bounds, exactly as for `bigint`.
 * @returns A validator that produces a bigint.
 * @throws {RangeError} When no bigint can satisfy the bounds together.
 */
export const coerceBigint = ((...args: unknown[]) =>
  coercing("bigint", bigint(...(args as [])), args, (input) => {
    if (typeof input === "bigint") {
      return [input];
    }
    if (typeof input === "number" && Number.isSafeInteger(input)) {
      return [BigInt(input)];
    }
    return typeof input === "string" && DECIMAL_INTEGER_PATTERN.test(input.trim()) ? [BigInt(input.trim())] : undefined;
  })) as Factory<bigint, BigintOptions>;
