import type { Validator } from "../core/types";
import { textFormat } from "./text-format";

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

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
