import type { Validator } from "../core/types";
import { HOSTNAME_PATTERN } from "./patterns";
import { textFormat } from "./text-format";

/**
 * Creates a validator for hostnames: dot-separated labels of letters, digits and hyphens, at most 253 characters. Unlike `url`, single-label hosts such as `localhost` are accepted. The value is not modified.
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
  return textFormat("hostname", (text) => HOSTNAME_PATTERN.test(text));
}
