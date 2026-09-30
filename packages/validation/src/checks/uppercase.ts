import { rule } from "../core/checks";
import type { Check, Message } from "../core/types";

/**
 * Requires a string to be in uppercase: unchanged by `toUpperCase()`, so a string with no letters
 * passes. It changes nothing; to uppercase the string instead, use `string({ case: "upper" })`. It fails with
 * `invalid_format` and `params` `{ format: "uppercase" }`.
 *
 * @example
 * ```ts
 * string(uppercase("Must be uppercase"));
 * ```
 *
 * @param message - Wording for the issue.
 * @returns A check of strings.
 */
export function uppercase(message?: Message): Check<string> {
  return rule((text) => text === text.toUpperCase(), "invalid_format", { format: "uppercase" }, message);
}
