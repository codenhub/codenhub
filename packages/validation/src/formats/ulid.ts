import type { Validator } from "../core/types";
import { textFormat } from "./text-format";

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

/**
 * Creates a validator for ULIDs in any letter case. The value is not modified.
 *
 * @example
 * ```ts
 * ulid()("01ARZ3NDEKTSV4RRFFQ69G5FAV"); // { ok: true, value: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }
 * ulid()("01ARZ3NDEKTSV4RRFFQ69G5FAU!"); // { ok: false, ... }, code "invalid_format"
 * ```
 *
 * @returns A validator that produces the identifier as a string.
 */
export function ulid(): Validator<string> {
  return textFormat("ulid", (text) => ULID_PATTERN.test(text));
}
