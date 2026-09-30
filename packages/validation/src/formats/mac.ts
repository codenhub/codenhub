import { formatFactory } from "./text-format";

/** Six pairs of hex digits, separated by colons throughout or by hyphens throughout. */
const MAC_PATTERN = /^[0-9a-f]{2}(?:(?::[0-9a-f]{2}){5}|(?:-[0-9a-f]{2}){5})$/i;

/**
 * Creates a validator for MAC addresses (EUI-48) written as six pairs of hex digits separated by
 * colons or by hyphens, such as `00:1A:2b:3c:4d:5e` or `00-1a-2b-3c-4d-5e`. The value is the canonical
 * spelling, lowercase with colons, so one address is one value however it was written.
 *
 * @example
 * ```ts
 * mac()("00-1A-2B-3C-4D-5E"); // { ok: true, value: "00:1a:2b:3c:4d:5e" }
 * mac()("00:1a-2b:3c:4d:5e"); // { ok: false, ... }: mixed separators
 * ```
 */
export const mac = /* @__PURE__ */ formatFactory("mac", (text) =>
  MAC_PATTERN.test(text) ? text.toLowerCase().replaceAll("-", ":") : undefined,
);
