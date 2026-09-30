import { rule } from "../core/checks";
import type { Check, Message } from "../core/types";

/**
 * Requires a string to be in lowercase: unchanged by `toLowerCase()`, so a string with no letters
 * passes. It changes nothing; to lowercase the string instead, use `string({ case: "lower" })`. It fails with
 * `invalid_format` and `params` `{ format: "lowercase" }`.
 *
 * @example
 * ```ts
 * string(lowercase("Must be lowercase"));
 * ```
 *
 * @param message - Wording for the issue.
 * @returns A check of strings.
 */
export function lowercase(message?: Message): Check<string> {
  return rule((text) => text === text.toLowerCase(), "invalid_format", { format: "lowercase" }, message);
}
