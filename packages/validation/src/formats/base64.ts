import { split } from "../core/checks";
import { assertOption } from "../core/result";
import type { Factory, MessageOptions } from "../core/types";
import { stringFormat } from "./text-format";

// The last character before padding holds only the bits the bytes need, so the rest are zero: `A`, `Q`,
// `g` and `w` before `==`, and every fourth character before `=`. Anything else decodes to a value that
// encodes back differently.
const BASE64_PATTERN = /^(?!$)(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/][AQgw]==|[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=)?$/;

// The URL-safe alphabet of RFC 4648 section 5, `-` and `_` for `+` and `/`, with the padding optional,
// since most producers leave it out, and the same rule for the last character.
const BASE64URL_PATTERN = /^(?!$)(?:[\w-]{4})*(?:[\w-][AQgw](?:==)?|[\w-]{2}[AEIMQUYcgkosw048]=?)?$/;

/** Options for {@link base64}. */
export interface Base64Options extends MessageOptions {
  /**
   * Requires the URL-safe alphabet of RFC 4648, with `-` and `_` for `+` and `/` and the padding
   * optional, and reports the format as `base64url`.
   *
   * @defaultValue false
   */
  url?: boolean;
}

/**
 * Creates a validator for base64 as an encoder writes it: the bits past the last byte are zero, and the
 * standard alphabet is correctly padded. An empty string, which encodes nothing, is rejected, as `hex`
 * rejects one. The value is not modified.
 *
 * @example
 * ```ts
 * base64()("aGVsbG8="); // { ok: true, value: "aGVsbG8=" }
 * base64()("aGVsbG8"); // { ok: false, ... }, code "invalid_format"
 * base64({ url: true })("aGVsbG8"); // { ok: true, ... }, padding is optional in the URL-safe alphabet
 * ```
 *
 * @throws {TypeError} When `url` is not a boolean.
 */
export const base64 = ((...args: unknown[]) => {
  const [{ url, message }, checks] = split<Base64Options, string>(args);
  assertOption("url", url, "boolean");
  const pattern = url === true ? BASE64URL_PATTERN : BASE64_PATTERN;
  return stringFormat(
    url === true ? "base64url" : "base64",
    (text) => (pattern.test(text) ? text : undefined),
    message,
    checks,
  );
}) as Factory<string, Base64Options>;
