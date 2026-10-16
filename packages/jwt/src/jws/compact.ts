import { isJwsAlgorithm } from "../core/limits";
import { fail, ok } from "../core/result";
import type { JwtHeader, JwtIssue, JwtPayload, JwtResult } from "../core/types";
import { decodeBase64Url, isBase64Url } from "../encoding/base64url";
import { parseJsonObject } from "../encoding/json";
import { encodeUtf8 } from "../encoding/text";

/** A compact JWS whose structure and header passed, and whose payload has not been read. */
export interface CompactJws {
  /** The validated, deep-frozen header. */
  readonly header: JwtHeader;
  /** The payload segment, still encoded; {@link parsePayload} reads it once the signature is verified. */
  readonly payloadSegment: string;
  /** The ASCII bytes of `<header>.<payload>`, which the signature covers. */
  readonly signingInput: Uint8Array<ArrayBuffer>;
  /** The decoded signature. */
  readonly signature: Uint8Array<ArrayBuffer>;
}

/** The three segments of a compact token whose characters passed, and its header. */
interface CheckedSegments {
  readonly header: JwtHeader;
  readonly headerSegment: string;
  readonly payloadSegment: string;
  readonly signatureSegment: string;
}

const SEGMENT_NAMES = ["header", "payload", "signature"] as const;

/** Header members whose value, when present, must be text. */
const TEXT_MEMBERS = ["kid", "typ", "cty"] as const;

/** Reads a member the header itself holds, never one inherited from `Object.prototype`. */
const ownMember = (header: object, name: string): unknown =>
  Object.hasOwn(header, name) ? (header as Record<string, unknown>)[name] : undefined;

/**
 * Checks a parsed header against what this package supports, returning the first issue found: an
 * unsupported or missing `alg`, any `crit` (no extension is understood), any `b64` (RFC 7797 is not
 * supported), or a `kid`, `typ` or `cty` that is not text.
 */
function headerIssue(header: object): JwtIssue | undefined {
  if (!isJwsAlgorithm(ownMember(header, "alg"))) {
    return { code: "unsupported_alg", path: ["header", "alg"] };
  }
  if (Object.hasOwn(header, "crit")) {
    return { code: "unsupported_crit", path: ["header", "crit"] };
  }
  if (Object.hasOwn(header, "b64")) {
    return { code: "malformed", path: ["header", "b64"] };
  }
  const notText = TEXT_MEMBERS.find(
    (name) => Object.hasOwn(header, name) && typeof ownMember(header, name) !== "string",
  );
  return notText === undefined ? undefined : { code: "malformed", path: ["header", notText] };
}

/**
 * Splits a compact token and checks everything up to and including its header: its type, its length
 * before any other work, exactly three non-empty canonical base64url segments, and the header's JSON and
 * members. The payload segment's characters are checked, but the payload is not decoded.
 */
export function checkSegments(token: unknown, maxLength: number): JwtResult<CheckedSegments> {
  if (typeof token !== "string") {
    return fail({ code: "malformed" });
  }
  if (token.length > maxLength) {
    return fail({ code: "too_large", params: { limit: "length", maximum: maxLength } });
  }
  const segments = token.split(".", 4);
  if (segments.length !== 3) {
    return fail({ code: "malformed" });
  }
  for (const [index, segment] of segments.entries()) {
    if (segment.length === 0 || !isBase64Url(segment)) {
      return fail({ code: "malformed", path: [SEGMENT_NAMES[index] as string] });
    }
  }
  const [headerSegment, payloadSegment, signatureSegment] = segments as [string, string, string];
  const parsed = parseJsonObject(decodeBase64Url(headerSegment) as Uint8Array, ["header"]);
  if (!parsed.ok) {
    return parsed;
  }
  const issue = headerIssue(parsed.value);
  if (issue !== undefined) {
    return fail(issue);
  }
  return ok({ header: parsed.value as JwtHeader, headerSegment, payloadSegment, signatureSegment });
}

/**
 * Parses a compact JWS for verification. The payload stays encoded: it is read only through
 * {@link parsePayload}, after the signature is verified.
 *
 * @param token - The untrusted token.
 * @param maxLength - The longest token accepted, in characters, checked before any decoding.
 * @returns The header, signing input and signature, or a failure with `malformed`, `too_large`,
 * `duplicate_key`, `unsupported_alg` or `unsupported_crit`. Never throws.
 */
export function parseCompact(token: unknown, maxLength: number): JwtResult<CompactJws> {
  const checked = checkSegments(token, maxLength);
  if (!checked.ok) {
    return checked;
  }
  const { header, headerSegment, payloadSegment, signatureSegment } = checked.value;
  return ok({
    header,
    payloadSegment,
    signingInput: encodeUtf8(`${headerSegment}.${payloadSegment}`),
    signature: decodeBase64Url(signatureSegment) as Uint8Array<ArrayBuffer>,
  });
}

/**
 * Decodes the payload of a parsed JWS into a deep-frozen object. Call it only after the signature is
 * verified: the payload of an unverified token is never read.
 *
 * @returns The payload, or a failure with `malformed`, `duplicate_key` or `too_large`, at path
 * `["payload"]`. Registered claim types are not checked here.
 */
export function parsePayload(jws: CompactJws): JwtResult<JwtPayload> {
  return parseJsonObject(decodeBase64Url(jws.payloadSegment) as Uint8Array, ["payload"]) as JwtResult<JwtPayload>;
}
