import type { Validator } from "../core/types";
import { isHostname } from "./patterns";
import { textFormat } from "./text-format";

/**
 * Creates a validator for hostnames: dot-separated labels of letters, digits and hyphens, at most 253 characters, whose last label is not all digits, since a name that ends that way reads as an IPv4 address. Unlike `url`, single-label hosts such as `localhost` are accepted. The value is not modified.
 *
 * @example
 * ```ts
 * hostname()("localhost"); // { ok: true, value: "localhost" }
 * hostname()("-bad.com"); // { ok: false, ... }, code "invalid_format"
 * ```
 *
 * @returns A validator that produces the hostname as a string.
 */
export function hostname(): Validator<string> {
  return textFormat("hostname", isHostname);
}
