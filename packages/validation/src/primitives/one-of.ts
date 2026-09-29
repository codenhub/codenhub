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
 */
export function oneOf<const T extends readonly (string | number)[]>(values: T): Validator<T[number]> {
  const options = [...values];
  return (input) =>
    (options as readonly unknown[]).includes(input)
      ? pass(input as T[number])
      : // A copy per failure, so changing an issue's list cannot change what the validator accepts.
        failIssue("invalid_value", { options: [...options] });
}
