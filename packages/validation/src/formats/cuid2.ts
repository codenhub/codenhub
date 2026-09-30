import { formatFactory } from "./text-format";

const CUID2_PATTERN = /^[a-z][a-z0-9]{23,31}$/;

/**
 * Creates a validator for CUID2 identifiers. The value is not modified.
 *
 * @example
 * ```ts
 * cuid2()("tz4a98xxat96iws9zmbrgj3a"); // { ok: true, value: "tz4a98xxat96iws9zmbrgj3a" }
 * cuid2()("1bad"); // { ok: false, ... }, code "invalid_format"
 * ```
 */
export const cuid2 = /* @__PURE__ */ formatFactory("cuid2", (text) => (CUID2_PATTERN.test(text) ? text : undefined));
