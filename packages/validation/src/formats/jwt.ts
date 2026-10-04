import { BASE64URL_PATTERN } from "./base64";
import { formatFactory } from "./text-format";

/** A header, a payload and a signature, which may be empty, in the base64url alphabet without padding. */
const JWT_PATTERN = /^([\w-]+)\.([\w-]+)\.([\w-]*)$/;

/**
 * Tests whether a segment is base64url as an encoder writes it: no length of one mod four, and no bits set
 * past the last byte, which `atob` ignores, so one token has one spelling, as `base64({ url: true })` holds it.
 */
const isEncoded = (segment: string): boolean => BASE64URL_PATTERN.test(segment);

/**
 * Tests whether JSON text that parsed holds an object with a key twice, as `{"alg":"none","alg":"HS256"}`.
 * `JSON.parse` keeps the last, and a parser that keeps the first reads another algorithm or claim. A key
 * is compared as it decodes, so `alg` with one of its letters written as a JSON escape is `alg`. The text is read once, so the work grows with it.
 */
function hasRepeatedKey(json: string): boolean {
  // The keys of each object open at this point, and undefined for an array.
  const open: (Set<string> | undefined)[] = [];
  let expectsKey = false;
  for (let index = 0; index < json.length; index += 1) {
    const char = json[index];
    if (char === '"') {
      let end = index + 1;
      while (json[end] !== '"') {
        end += json[end] === "\\" ? 2 : 1;
      }
      const keys = open[open.length - 1];
      if (expectsKey && keys !== undefined) {
        const key = JSON.parse(json.slice(index, end + 1)) as string;
        if (keys.has(key)) {
          return true;
        }
        keys.add(key);
        expectsKey = false;
      }
      index = end;
    } else if (char === "{" || char === "[") {
      open.push(char === "{" ? new Set() : undefined);
      expectsKey = char === "{";
    } else if (char === "}" || char === "]") {
      open.pop();
      expectsKey = false;
    } else if (char === ",") {
      expectsKey = open[open.length - 1] !== undefined;
    }
  }
  return false;
}

/**
 * Decodes an unpadded base64url segment and parses it as a JSON object, or returns undefined, as for an
 * object that holds a key twice.
 */
const readSegment = (segment: string): unknown => {
  try {
    const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    );
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) && !hasRepeatedKey(json)
      ? parsed
      : undefined;
  } catch {
    // atob throws on text that is not base64, the decoder on bytes that are not UTF-8, JSON.parse on text
    // that is not JSON. The decoder keeps a byte order mark, which it would otherwise drop without a word,
    // so JSON.parse rejects it as every JWT library that parses the text does.
    return undefined;
  }
};

/**
 * Creates a validator for JSON Web Tokens in compact form: three base64url segments separated by
 * dots, whose header and payload decode to JSON objects with no key twice in any object, and whose
 * header names an algorithm in `alg`. The value is not modified.
 *
 * @remarks
 * Only the structure is checked. The signature is not verified and the claims, such as the expiry, are
 * not read: a token that passes may be forged or expired. Verify it with the key before trusting it. A
 * key given twice, as in `{"alg":"none","alg":"HS256"}`, is rejected, since JSON parsers disagree on which
 * one it means.
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
