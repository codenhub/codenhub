import { rule } from "../core/checks";
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
 */
export function startsWith(value: string, message?: Message): Check<string> {
  return rule((text) => text.startsWith(value), "invalid_format", { format: "startsWith", value }, message);
}
