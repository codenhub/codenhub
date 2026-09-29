import { invalidCoercion } from "../core/result";
import type { Validator } from "../core/types";
import { string, type StringOptions } from "../primitives/string";

/**
 * Creates a validator for text that also accepts numbers, bigints and booleans, converting them to
 * their string form, then applies the same constraints as {@link string}.
 *
 * @remarks
 * `null`, `undefined`, objects, arrays, functions and symbols are not converted: guessing what an
 * object should look like as text would hide bugs. A value that cannot be converted fails with
 * `invalid_type` and `coerced: true` in `params`.
 *
 * @example
 * ```ts
 * coerceString({ min: 2 })(12); // { ok: true, value: "12" }
 * coerceString()(null); // { ok: false, ... }, code "invalid_type"
 * ```
 *
 * @param options - Constraints and clean-up, exactly as for `string`.
 * @returns A validator that produces a string.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer.
 * @throws {TypeError} When both `lowercase` and `uppercase` are set.
 */
export function coerceString(options: StringOptions = {}): Validator<string> {
  const strict = string(options);
  return (input) =>
    typeof input === "string" || typeof input === "number" || typeof input === "bigint" || typeof input === "boolean"
      ? strict(String(input))
      : invalidCoercion("string", input);
}
