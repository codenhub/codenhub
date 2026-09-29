import type { Validator } from "../core/types";
import { textFormat } from "./text-format";

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Creates a validator for standard base64 with correct padding. The value is not modified.
 *
 * @example
 * ```ts
 * base64()("aGVsbG8="); // { ok: true, value: "aGVsbG8=" }
 * base64()("aGVsbG8"); // { ok: false, ... }, code "invalid_format"
 * ```
 *
 * @returns A validator that produces the string.
 */
export function base64(): Validator<string> {
  return textFormat("base64", (text) => BASE64_PATTERN.test(text));
}
