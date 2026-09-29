import type { Validator } from "../core/types";
import { textFormat } from "./text-format";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Creates a validator for UUIDs of version 1 to 8 in hyphenated form, in any letter case. The value is not modified.
 *
 * @example
 * ```ts
 * uuid()("123e4567-e89b-12d3-a456-426614174000"); // { ok: true, value: "123e4567-e89b-12d3-a456-426614174000" }
 * uuid()("not-a-uuid"); // { ok: false, ... }, code "invalid_format"
 * ```
 *
 * @returns A validator that produces the UUID as a string.
 */
export function uuid(): Validator<string> {
  return textFormat("uuid", (text) => UUID_PATTERN.test(text));
}
