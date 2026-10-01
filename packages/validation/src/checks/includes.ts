import { rule } from "../core/checks";
import { assertText } from "../core/result";
import type { Check, Message } from "../core/types";

/**
 * Requires a string to contain a substring. It fails with `invalid_format` and `params`
 * `{ format: "includes", value }`.
 *
 * @example
 * ```ts
 * string(includes("@"));
 * ```
 *
 * @param value - The text required.
 * @param message - Wording for the issue.
 * @returns A check of strings.
 * @throws {TypeError} When `value` is not text, such as a variable that is not set, or `message` is
 * neither text nor a function.
 */
export function includes(value: string, message?: Message): Check<string> {
  assertText("includes(value)", value);
  return rule((text) => text.includes(value), "invalid_format", { format: "includes", value }, message);
}
