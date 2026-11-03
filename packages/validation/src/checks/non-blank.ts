import { rule } from "../core/checks";
import type { Check, Message } from "../core/types";

/** A character that is not blank, as {@link nonBlank} defines blank. Linear in the length of the text. */
const NOT_BLANK_PATTERN = /[^\s\p{Cf}\u115F\u1160\u2800\u3164\uFFA0]/u;

/**
 * Requires a string to hold a character that is not blank, so an empty string and one of spaces alone
 * fail. Blank is the white space `trim` removes, the invisible format characters (Unicode category Cf,
 * such as the zero-width space, the word joiner and the soft hyphen), and the characters that render as
 * blank space without being white space: the Hangul fillers U+115F, U+1160, U+3164 and U+FFA0 and the
 * blank braille pattern U+2800. It changes nothing; to remove the white space around the string instead,
 * and require what is left, use `string({ trim: true, min: 1 })`, which removes only white space. It
 * fails with `invalid_format` and `params` `{ format: "nonBlank" }`.
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
  return rule((text) => NOT_BLANK_PATTERN.test(text), "invalid_format", { format: "nonBlank" }, message);
}
