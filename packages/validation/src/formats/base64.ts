import type { Validator } from "../core/types";
import { textFormat } from "./text-format";

// The last character before padding holds only the bits the bytes need, so the rest are zero: `A`, `Q`,
// `g` and `w` before `==`, and every fourth character before `=`. Anything else decodes to a value that
// encodes back differently.
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/][AQgw]==|[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=)?$/;

/**
 * Creates a validator for standard base64 with correct padding, as an encoder writes it: the bits past the last byte are zero. The value is not modified.
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
