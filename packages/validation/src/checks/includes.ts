import { rule } from "../core/checks";
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
 */
export function includes(value: string, message?: Message): Check<string> {
  return rule((text) => text.includes(value), "invalid_format", { format: "includes", value }, message);
}
