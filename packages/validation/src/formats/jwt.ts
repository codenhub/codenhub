import { formatFactory } from "./text-format";

/** A header and a payload in unpadded base64url, and a signature that is empty only for an unsigned token. */
const JWT_PATTERN = /^([\w-]+)\.([\w-]+)\.([\w-]*)$/;

/** Decodes an unpadded base64url segment and parses it as a JSON object, or returns undefined. */
const readSegment = (segment: string): unknown => {
  try {
    const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    // atob throws on text that is not base64, JSON.parse on text that is not JSON.
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
  if (match === null) {
    return undefined;
  }
  const header = readSegment(match[1] as string) as { alg?: unknown } | undefined;
  return typeof header?.alg === "string" && readSegment(match[2] as string) !== undefined ? text : undefined;
});
