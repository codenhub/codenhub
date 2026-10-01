import type { Factory } from "../core/types";
import { number, type NumberOptions } from "../primitives/number";
import { coercing } from "./coerce";

// The fraction is one optional group so no two digit runs are adjacent, which keeps matching linear.
const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Creates a validator for numbers that also accepts text holding a decimal number, converting it,
 * then applies the same constraints as {@link number}.
 *
 * @remarks
 * Surrounding whitespace is ignored, and a dot with no digits on one side, as in `".5"` or `"5."`,
 * is read as people type it. Empty strings, `"1e3"`, `"0x10"`, `"1,5"`, `"Infinity"` and
 * `"NaN"` are rejected, and so is text holding a whole number beyond `Number.MAX_SAFE_INTEGER`, which
 * could not be read exactly (use `coerceBigint` for those). So are booleans, `null`, objects and
 * arrays: `Number(true)` is `1`, and silently reading a flag as a count is how bugs hide. A value that cannot be converted fails with
 * `invalid_type` and `coerced: true` in `params`.
 *
 * @example
 * ```ts
 * const port = coerceNumber({ int: true, min: 1, max: 65535 });
 * port("8080"); // { ok: true, value: 8080 }
 * port("0"); // { ok: false, ... }, code "too_small"
 * port("abc"); // { ok: false, ... }, code "invalid_type"
 * ```
 *
 * @param options - Constraints and clean-up, exactly as for `number`.
 * @returns A validator that produces a number.
 * @throws {TypeError} When a bound is not a number, `int` or `safeInt` is not a boolean, or `clamp` is not a range with
 * a number `min` and `max`.
 * @throws {RangeError} When a bound is `NaN`, a lower bound is `Infinity` or an upper one `-Infinity`,
 * no number can satisfy the bounds together, or `clamp`
 * has a `NaN` bound, a minimum above its maximum, or a range whose every value breaks a bound.
 */
export const coerceNumber = ((...args: unknown[]) =>
  coercing("number", number(...(args as [])), args, (input) => {
    if (typeof input === "number") {
      return [input];
    }
    if (typeof input !== "string" || !DECIMAL_NUMBER_PATTERN.test(input.trim())) {
      return undefined;
    }
    const converted = Number(input.trim());
    // A whole number past Number.MAX_SAFE_INTEGER has already lost digits, so reading it would
    // produce a different number than the text says. "-0" is read as 0, since a minus sign in front of
    // nothing is not a value anyone meant.
    return Number.isFinite(converted) && (!Number.isInteger(converted) || Number.isSafeInteger(converted))
      ? [converted === 0 ? 0 : converted]
      : undefined;
  })) as Factory<number, NumberOptions>;
