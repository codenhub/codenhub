import { BASE64URL_PATTERN } from "./base64";
import { formatFactory } from "./text-format";

/** A header, a payload and a signature, which may be empty, in the base64url alphabet without padding. */
const JWT_PATTERN = /^([\w-]+)\.([\w-]+)\.([\w-]*)$/;

/**
 * Tests whether a segment is base64url as an encoder writes it: no length of one mod four, and no bits set
 * past the last byte, which `atob` ignores, so one token has one spelling, as `base64({ url: true })` holds it.
 */
const isEncoded = (segment: string): boolean => BASE64URL_PATTERN.test(segment);

/** Decodes an unpadded base64url segment and parses it as a JSON object, or returns undefined. */
const readSegment = (segment: string): unknown => {
  try {
    const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      ),
    );
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    // atob throws on text that is not base64, the decoder on bytes that are not UTF-8, JSON.parse on text
    // that is not JSON. The decoder keeps a byte order mark, which it would otherwise drop without a word,
    // so JSON.parse rejects it as every JWT library that parses the text does.
    return undefined;
  }
};

/**
 * Creates a validator for JSON Web Tokens in compact form: three base64url segments separated by
 * dots, whose header and payload decode to JSON objects, and whose header names an algorithm in
 * `alg`. The value is not modified.
 *
 * @remarks
 * Only the structure is checked. The signature is not verified and the claims, such as the expiry, are
 * not read: a token that passes may be forged or expired. Verify it with the key before trusting it.
 *
 * @example
 * ```ts
 * jwt()("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl"); // { ok: true, ... }
 * jwt()("not.a.token"); // { ok: false, ... }, code "invalid_format"
 * ```
 */
export const jwt = /* @__PURE__ */ formatFactory("jwt", (text) => {
  const match = JWT_PATTERN.exec(text);
  const [, encodedHeader = "", encodedPayload = "", signature = ""] = match ?? [];
  if (
    match === null ||
    !isEncoded(encodedHeader) ||
    !isEncoded(encodedPayload) ||
    (signature !== "" && !isEncoded(signature))
  ) {
    return undefined;
  }
  const header = readSegment(encodedHeader) as { alg?: unknown } | undefined;
  return typeof header?.alg === "string" && readSegment(encodedPayload) !== undefined ? text : undefined;
});
