import { MAX_JWS_SIGNATURES, REGISTERED_HEADER_NAMES } from "../core/limits";
import { fail, frozenOk } from "../core/result";
import type { JwtHeader, JwtIssue, JwtPathSegment, JwtResult } from "../core/types";
import { decodeBase64Url, isBase64Url } from "../encoding/base64url";
import { parseJsonObject, type JsonObject } from "../encoding/json";
import { encodeUtf8 } from "../encoding/text";
import { ownMember, textMemberIssue } from "./compact";

/** One signature of a parsed JWS, whose structure and headers passed, and whose signature is not checked. */
export interface JwsSignature {
  /** The protected header, deep-frozen. */
  readonly protectedHeader: JsonObject;
  /** The unprotected header of the JSON serialization, deep-frozen, when the signature has one. */
  readonly unprotectedHeader: JsonObject | undefined;
  /** Both headers in one frozen object, which key selection reads; they share no member. */
  readonly header: JwtHeader;
  /** The protected header as the JWS carries it, base64url-encoded, which the signature covers. */
  readonly protectedSegment: string;
  /** The decoded signature. */
  readonly signature: Uint8Array<ArrayBuffer>;
}

/** A JWS in any serialization whose structure passed, and whose payload has not been decoded. */
export interface ParsedJws {
  /** Its signatures, in order: one, unless it is the general JSON serialization. */
  readonly signatures: readonly JwsSignature[];
  /** Whether it is the general JSON serialization, whose issues are reported under `["signatures", index]`. */
  readonly general: boolean;
  /** `false` when the payload is unencoded (RFC 7797); every signature agrees. */
  readonly b64: boolean;
  /**
   * The payload as the JWS carries it, base64url text or the unencoded payload, already checked; `""` for an
   * empty compact segment or JSON `payload`, `undefined` when a JSON JWS has no `payload` member.
   */
  readonly payload: string | undefined;
}

/** Starts the JSON serialization: optional JSON whitespace, then an object. A compact JWS never starts so. */
const JSON_START = /^[\t\n\r ]*\{/u;

/** Characters an unencoded compact payload may hold (RFC 7797 §5.2): printable ASCII other than `.`. */
const UNENCODED_COMPACT_PAYLOAD = /^[ --/-~]*$/u;

/** Header parameters RFC 7515 and RFC 7797 require to be integrity protected. */
const PROTECTED_ONLY = ["alg", "crit", "b64"] as const;

/** Members of a flattened signature, which a general JWS may not hold beside `signatures`. */
const SIGNATURE_MEMBERS = ["protected", "header", "signature"] as const;

const malformed = (path?: readonly JwtPathSegment[]): JwtIssue =>
  path === undefined ? { code: "malformed" } : { code: "malformed", path };

/**
 * Parses a JWS in the compact, flattened JSON or general JSON serialization (RFC 7515 §7) for verification,
 * checking everything that needs no key: its type, its length before any other work, its structure, each
 * signature's headers, and the payload's characters. The payload is not decoded.
 *
 * Every issue here concerns the JWS as a whole, so a general JWS with one bad signature fails, and the issue's
 * path starts with `["signatures", index]`. The algorithm and `crit` names a verifier understands are left to
 * it, since a general JWS may hold signatures it cannot check beside one it can.
 *
 * @returns The parsed JWS, or a failure with `malformed`, `too_large` or `duplicate_key`. Never throws.
 */
export function parseJws(input: unknown, maxLength: number): JwtResult<ParsedJws> {
  if (typeof input !== "string") {
    return fail(malformed());
  }
  if (input.length > maxLength) {
    return fail({ code: "too_large", params: { limit: "length", maximum: maxLength } });
  }
  if (!input.isWellFormed()) {
    return fail(malformed());
  }
  return JSON_START.test(input) ? parseJsonJws(input) : parseCompactJws(input);
}

function parseCompactJws(input: string): JwtResult<ParsedJws> {
  const segments = input.split(".", 4);
  if (segments.length !== 3) {
    return fail(malformed());
  }
  const [protectedSegment, payload, signatureSegment] = segments as [string, string, string];
  if (protectedSegment.length === 0 || !isBase64Url(protectedSegment)) {
    return fail(malformed(["header"]));
  }
  if (signatureSegment.length === 0 || !isBase64Url(signatureSegment)) {
    return fail(malformed(["signature"]));
  }
  const parsed = parseJsonObject(decodeBase64Url(protectedSegment) as Uint8Array, ["header"]);
  if (!parsed.ok) {
    return parsed;
  }
  const issue = headerIssue(parsed.value, undefined);
  if (issue !== undefined) {
    return fail(issue);
  }
  const b64 = ownMember(parsed.value, "b64") !== false;
  if (!(b64 ? isBase64Url(payload) : UNENCODED_COMPACT_PAYLOAD.test(payload))) {
    return fail(malformed(["payload"]));
  }
  const signature: JwsSignature = Object.freeze({
    protectedHeader: parsed.value,
    unprotectedHeader: undefined,
    header: parsed.value as JwtHeader,
    protectedSegment,
    signature: decodeBase64Url(signatureSegment) as Uint8Array<ArrayBuffer>,
  });
  return frozenOk(Object.freeze({ signatures: Object.freeze([signature]), general: false, b64, payload }));
}

function parseJsonJws(input: string): JwtResult<ParsedJws> {
  const parsed = parseJsonObject(encodeUtf8(input));
  if (!parsed.ok) {
    return parsed;
  }
  const jws = parsed.value;
  // Members RFC 7515 does not define are ignored, as §7.2.1 requires.
  const payload = ownMember(jws, "payload");
  if (Object.hasOwn(jws, "payload") && typeof payload !== "string") {
    return fail(malformed(["payload"]));
  }
  const general = Object.hasOwn(jws, "signatures");
  let entries: readonly unknown[];
  if (general) {
    const listed = ownMember(jws, "signatures");
    if (SIGNATURE_MEMBERS.some((name) => Object.hasOwn(jws, name)) || !Array.isArray(listed) || listed.length === 0) {
      return fail(malformed(["signatures"]));
    }
    if (listed.length > MAX_JWS_SIGNATURES) {
      return fail({
        code: "too_large",
        path: ["signatures"],
        params: { limit: "signatures", maximum: MAX_JWS_SIGNATURES },
      });
    }
    entries = listed;
  } else {
    entries = [jws];
  }
  const signatures: JwsSignature[] = [];
  for (const [index, entry] of entries.entries()) {
    const prefix: readonly JwtPathSegment[] = general ? ["signatures", index] : [];
    const read = readSignature(entry, prefix);
    if (!read.ok) {
      return read;
    }
    signatures.push(read.value);
  }
  const b64 = ownMember((signatures[0] as JwsSignature).protectedHeader, "b64") !== false;
  const disagreeing = signatures.findIndex(
    (signature) => (ownMember(signature.protectedHeader, "b64") !== false) !== b64,
  );
  if (disagreeing !== -1) {
    return fail(malformed([...(general ? ["signatures", disagreeing] : []), "header", "b64"]));
  }
  // An unencoded payload is signed as its UTF-8 bytes, which a lone surrogate, escaped in the JSON, has none of.
  if (typeof payload === "string" && !(b64 ? isBase64Url(payload) : payload.isWellFormed())) {
    return fail(malformed(["payload"]));
  }
  return frozenOk(
    Object.freeze({ signatures: Object.freeze(signatures), general, b64, payload: payload as string | undefined }),
  );
}

/** Reads one signature object of the JSON serialization: its `protected`, `header` and `signature` members. */
function readSignature(entry: unknown, prefix: readonly JwtPathSegment[]): JwtResult<JwsSignature> {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    return fail(malformed(prefix));
  }
  const protectedSegment = ownMember(entry, "protected");
  if (typeof protectedSegment !== "string" || protectedSegment.length === 0 || !isBase64Url(protectedSegment)) {
    return fail(malformed([...prefix, "protected"]));
  }
  const unprotectedHeader = ownMember(entry, "header");
  if (
    Object.hasOwn(entry, "header") &&
    (typeof unprotectedHeader !== "object" || unprotectedHeader === null || Array.isArray(unprotectedHeader))
  ) {
    return fail(malformed([...prefix, "header"]));
  }
  const signatureSegment = ownMember(entry, "signature");
  if (typeof signatureSegment !== "string" || signatureSegment.length === 0 || !isBase64Url(signatureSegment)) {
    return fail(malformed([...prefix, "signature"]));
  }
  const parsed = parseJsonObject(decodeBase64Url(protectedSegment) as Uint8Array, [...prefix, "protected"]);
  if (!parsed.ok) {
    return parsed;
  }
  const unprotected = unprotectedHeader as JsonObject | undefined;
  const issue = headerIssue(parsed.value, unprotected);
  if (issue !== undefined) {
    return fail({ ...issue, path: [...prefix, ...(issue.path ?? [])] });
  }
  return frozenOk(
    Object.freeze({
      protectedHeader: parsed.value,
      unprotectedHeader: unprotected,
      header: (unprotected === undefined
        ? parsed.value
        : Object.freeze({ ...parsed.value, ...unprotected })) as JwtHeader,
      protectedSegment,
      signature: decodeBase64Url(signatureSegment) as Uint8Array<ArrayBuffer>,
    }),
  );
}

/**
 * Checks a signature's headers, returning the first issue found, each `malformed` at `["header", name]`:
 * `alg`, `crit` or `b64` outside the protected header; a member in both headers; a `crit` that is not a
 * non-empty list of distinct names, each present in the protected header and none defined by RFC 7515 or
 * RFC 7518 (RFC 7515 §4.1.11); a `b64` that is not a boolean or that `crit` does not list (RFC 7797 §6); or a
 * `kid`, `typ` or `cty` that is not text. Whether the algorithm and the `crit` names are understood is left
 * to the verifier.
 */
function headerIssue(protectedHeader: JsonObject, unprotectedHeader: JsonObject | undefined): JwtIssue | undefined {
  if (unprotectedHeader !== undefined) {
    const misplaced =
      PROTECTED_ONLY.find((name) => Object.hasOwn(unprotectedHeader, name)) ??
      Object.keys(unprotectedHeader).find((name) => Object.hasOwn(protectedHeader, name));
    if (misplaced !== undefined) {
      return malformed(["header", misplaced]);
    }
  }
  const crit = ownMember(protectedHeader, "crit");
  if (
    Object.hasOwn(protectedHeader, "crit") &&
    !(
      Array.isArray(crit) &&
      crit.length > 0 &&
      crit.every(
        (name: unknown, index) =>
          typeof name === "string" &&
          !REGISTERED_HEADER_NAMES.includes(name) &&
          crit.indexOf(name) === index &&
          Object.hasOwn(protectedHeader, name),
      )
    )
  ) {
    return malformed(["header", "crit"]);
  }
  if (
    Object.hasOwn(protectedHeader, "b64") &&
    (typeof ownMember(protectedHeader, "b64") !== "boolean" ||
      !(crit as readonly unknown[] | undefined)?.includes("b64"))
  ) {
    return malformed(["header", "b64"]);
  }
  return textMemberIssue(
    unprotectedHeader === undefined ? protectedHeader : { ...protectedHeader, ...unprotectedHeader },
  );
}
