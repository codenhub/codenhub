import { rule } from "../core/checks";
import { sourceOfRegExp } from "../core/objects";
import type { Check, Message } from "../core/types";

/**
 * Requires a string to match a regular expression.
 *
 * @remarks
 * The `g` and `y` flags are dropped, so the check gives the same answer on every call. It fails with
 * `invalid_format` and `params` `{ format: "regex", pattern }`, the pattern written as `/source/flags`.
 *
 * @example
 * ```ts
 * string(pattern(/^[a-z]+$/, "Lowercase letters only"));
 * ```
 *
 * @param expression - What the string must match.
 * @param message - Wording for the issue.
 * @returns A check of strings.
 * @throws {TypeError} When `expression` is not a regular expression.
 */
export function pattern(expression: RegExp, message?: Message): Check<string> {
  // Checked with the built-in getter, so a regular expression from another realm, such as an iframe, is
  // one too, and an object that merely has `source` and `flags` is not.
  const source = sourceOfRegExp(expression);
  if (source === undefined) {
    throw new TypeError(`pattern needs a RegExp, received ${expression === null ? "null" : typeof expression}`);
  }
  const stateless = new RegExp(source, expression.flags.replace(/[gy]/g, ""));
  return rule(
    (value) => stateless.test(value),
    "invalid_format",
    { format: "regex", pattern: String(expression) },
    message,
  );
}
