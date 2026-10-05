import { rule } from "../core/checks";
import type { Check, Message } from "../core/types";

/**
 * Requires a string to hold a character that is not white space, so an empty string and one of spaces
 * alone fail. It changes nothing; to remove the white space around the string instead, and require what
 * is left, use `string({ trim: true, min: 1 })`. It fails with `invalid_format` and `params`
 * `{ format: "nonBlank" }`.
 *
 * @example
 * ```ts
 * string(nonBlank("Say something"));
 * ```
 *
 * @param message - Wording for the issue.
 * @returns A check of strings.
 */
export function nonBlank(message?: Message): Check<string> {
  return rule((text) => text.trim() !== "", "invalid_format", { format: "nonBlank" }, message);
}
