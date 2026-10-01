import { rule } from "../core/checks";
import { assertText } from "../core/result";
import type { Check, Message } from "../core/types";

/**
 * Requires a string to end with a suffix. It fails with `invalid_format` and `params`
 * `{ format: "endsWith", value }`.
 *
 * @example
 * ```ts
 * string(endsWith(".pdf", "Upload a PDF"));
 * ```
 *
 * @param value - The text required.
 * @param message - Wording for the issue.
 * @returns A check of strings.
 * @throws {TypeError} When `value` is not text, such as a variable that is not set, or `message` is
 * neither text nor a function.
 */
export function endsWith(value: string, message?: Message): Check<string> {
  assertText("endsWith(value)", value);
  return rule((text) => text.endsWith(value), "invalid_format", { format: "endsWith", value }, message);
}
