import { rule } from "../core/checks";
import type { Check, Message } from "../core/types";

/**
 * Requires a number other than zero. It fails with `invalid_value` and `params`
 * `{ type: "number", format: "nonZero" }`.
 *
 * @example
 * ```ts
 * number(nonZero("Cannot be zero"));
 * ```
 *
 * @param message - Wording for the issue.
 * @returns A check of numbers.
 */
export function nonZero(message?: Message): Check<number> {
  return rule((value) => value !== 0, "invalid_value", { type: "number", format: "nonZero" }, message);
}
