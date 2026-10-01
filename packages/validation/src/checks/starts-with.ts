import { rule } from "../core/checks";
import { assertText } from "../core/result";
import type { Check, Message } from "../core/types";

/**
 * Requires a string to start with a prefix. It fails with `invalid_format` and `params`
 * `{ format: "startsWith", value }`.
 *
 * @example
 * ```ts
 * string(startsWith("https://"));
 * ```
 *
 * @param value - The text required.
 * @param message - Wording for the issue.
 * @returns A check of strings.
 * @throws {TypeError} When `value` is not text, such as a variable that is not set, or `message` is
 * neither text nor a function.
 */
export function startsWith(value: string, message?: Message): Check<string> {
  assertText("startsWith(value)", value);
  return rule((text) => text.startsWith(value), "invalid_format", { format: "startsWith", value }, message);
}
