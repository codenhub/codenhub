import { formatFactory } from "./text-format";

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

/**
 * Creates a validator for ULIDs in any letter case. The value is the ULID in uppercase, the form its
 * specification writes, so one ULID is one value however it was written.
 *
 * @example
 * ```ts
 * ulid()("01ARZ3NDEKTSV4RRFFQ69G5FAV"); // { ok: true, value: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }
 * ulid()("01arz3ndektsv4rrffq69g5fav"); // { ok: true, value: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }
 * ulid()("01ARZ3NDEKTSV4RRFFQ69G5FAU!"); // { ok: false, ... }, code "invalid_format"
 * ```
 */
export const ulid = /* @__PURE__ */ formatFactory("ulid", (text) =>
  ULID_PATTERN.test(text) ? text.toUpperCase() : undefined,
);
