import { invalidCoercion } from "../core/result";
import type { Validator } from "../core/types";
import { number, type NumberOptions } from "../primitives/number";

const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

/**
 * Creates a validator for numbers that also accepts text holding a decimal number, converting it,
 * then applies the same constraints as {@link number}.
 *
 * @remarks
 * Surrounding whitespace is ignored. Empty strings, `"1e3"`, `"0x10"`, `"1,5"`, `"Infinity"` and
 * `"NaN"` are rejected, and so are booleans, `null`, objects and arrays: `Number(true)` is `1`, and
 * silently reading a flag as a count is how bugs hide. A value that cannot be converted fails with
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
 * @throws {RangeError} When `multipleOf` is not a positive finite number, or `clamp` has a `NaN` bound or a
 * minimum above its maximum.
 */
export function coerceNumber(options: NumberOptions = {}): Validator<number> {
  const strict = number(options);
  return (input) => {
    if (typeof input === "number") {
      return strict(input);
    }
    if (typeof input !== "string" || !DECIMAL_NUMBER_PATTERN.test(input.trim())) {
      return invalidCoercion("number", input);
    }
    const converted = Number(input.trim());
    return Number.isFinite(converted) ? strict(converted) : invalidCoercion("number", input);
  };
}
