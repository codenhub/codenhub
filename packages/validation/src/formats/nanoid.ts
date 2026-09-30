import { formatFactory } from "./text-format";

const NANOID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

/**
 * Creates a validator for Nano IDs in their default form: 21 characters of `A-Za-z0-9_-`. The value is not modified.
 *
 * @example
 * ```ts
 * nanoid()("V1StGXR8_Z5jdHi6B-myT"); // { ok: true, value: "V1StGXR8_Z5jdHi6B-myT" }
 * nanoid()("short"); // { ok: false, ... }, code "invalid_format"
 * ```
 */
export const nanoid = /* @__PURE__ */ formatFactory("nanoid", (text) => (NANOID_PATTERN.test(text) ? text : undefined));
