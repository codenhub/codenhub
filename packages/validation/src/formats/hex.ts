import type { Validator } from "../core/types";
import { textFormat } from "./text-format";

const HEX_PATTERN = /^[0-9a-f]+$/i;

/**
 * Creates a validator for one or more hexadecimal digits of any letter case. The value is not modified.
 *
 * @example
 * ```ts
 * hex()("deadBEEF01"); // { ok: true, value: "deadBEEF01" }
 * hex()("xyz"); // { ok: false, ... }, code "invalid_format"
 * ```
 *
 * @returns A validator that produces the string.
 */
export function hex(): Validator<string> {
  return textFormat("hex", (text) => HEX_PATTERN.test(text));
}
