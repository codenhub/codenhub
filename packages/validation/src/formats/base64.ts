import { split } from "../core/checks";
import { described } from "../core/describe";
import { assertOption } from "../core/result";
import type { Factory, MessageOptions } from "../core/types";
import { stringFormat } from "./text-format";

// The last character before padding holds only the bits the bytes need, so the rest are zero: `A`, `Q`,
// `g` and `w` before `==`, and every fourth character before `=`. Anything else decodes to a value that
// encodes back differently.
const TWO_LEFT = /[AQgw]/;
const THREE_LEFT = /[AEIMQUYcgkosw048]/;
const ALPHABET = /^[A-Za-z0-9+/]+$/;
// The URL-safe alphabet of RFC 4648 section 5, `-` and `_` for `+` and `/`.
const URL_ALPHABET = /^[\w-]+$/;

/**
 * Tests text as base64 with the given alphabet, and the padding optional when `isPaddingOptional`, as the
 * URL-safe form leaves it. Read by its length and its last characters, where a pattern repeating a group of
 * four overflowed the stack on a few megabytes of text.
 */
const isBase64 = (text: string, alphabet: RegExp, isPaddingOptional: boolean): boolean => {
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const body = text.slice(0, text.length - padding);
  const left = body.length % 4;
  const last = body.slice(-1);
  const isPadded =
    left === 0
      ? padding === 0
      : left === 2
        ? TWO_LEFT.test(last) && (padding === 2 || (isPaddingOptional && padding === 0))
        : left === 3 && THREE_LEFT.test(last) && (padding === 1 || (isPaddingOptional && padding === 0));
  return isPadded && alphabet.test(body);
};

/** Tests text as base64url as an encoder writes it, with the padding optional, since most producers leave it out. */
export const isBase64url = (text: string): boolean => isBase64(text, URL_ALPHABET, true);

/** Options for {@link base64}. */
export interface Base64Options extends MessageOptions {
  /**
   * Requires the URL-safe alphabet of RFC 4648, with `-` and `_` for `+` and `/` and the padding
   * optional, and reports the format as `base64url`.
   *
   * @defaultValue false
   */
  url?: boolean | undefined;
}

/**
 * Creates a validator for base64 as an encoder writes it: the bits past the last byte are zero, and the
 * standard alphabet is correctly padded. Whitespace and line breaks are rejected, so base64 wrapped at
 * 64 or 76 columns, as PEM and MIME write it, fails. An empty string, which encodes nothing, is rejected, as `hex`
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
  const [options, checks] = split<Base64Options, string>(args, "url");
  const { url, message } = options;
  assertOption("url", url, "boolean");
  return described(
    stringFormat(
      url === true ? "base64url" : "base64",
      (text) => ((url === true ? isBase64url(text) : isBase64(text, ALPHABET, false)) ? text : undefined),
      message,
      checks,
    ),
    { kind: "format", format: "base64", options, checks },
  );
}) as Factory<string, Base64Options>;
