import { failIssue, pass } from "../core/result";
import type { Validator } from "../core/types";

/**
 * Creates a validator that accepts any one value of a list, compared with `===`. The type is the
 * union of the listed values, so `oneOf(["admin", "user"])` produces `"admin" | "user"`.
 *
 * @example
 * ```ts
 * const role = oneOf(["admin", "user"]);
 * role("admin"); // { ok: true, value: "admin" }
 * role("guest"); // { ok: false, ... }, code "invalid_value", params { options: ["admin", "user"] }
 * ```
 *
 * @typeParam T - The listed values.
 * @param values - The accepted strings or numbers. The list is copied, so changing it later has no effect.
 * @returns A validator that produces one of `values`.
 * @throws {TypeError} When `values` is empty, so the validator would accept nothing.
 * @throws {RangeError} When `values` holds `NaN`, which no value equals.
 */
export function oneOf<const T extends readonly (string | number)[]>(values: T): Validator<T[number]> {
  const options = [...values];
  if (options.length === 0) {
    throw new TypeError("oneOf() needs at least one value");
  }
  if (options.some((option) => Number.isNaN(option))) {
    throw new RangeError("oneOf() cannot match NaN, which no value equals");
  }
  return (input) =>
    // indexOf compares with ===, as documented, where includes would also match NaN.
    (options as readonly unknown[]).indexOf(input) !== -1
      ? pass(input as T[number])
      : // A copy per failure, so changing an issue's list cannot change what the validator accepts.
        failIssue("invalid_value", { options: [...options] });
}
