import { isPlainObject } from "../core/plain";
import { fail, ok } from "../core/result";
import type { JwtIssue, JwtResult } from "../core/types";
import { decodeBase64Url, isBase64Url } from "../encoding/base64url";
import { parseJsonObject } from "../encoding/json";
import { encodeUtf8 } from "../encoding/text";
import {
  CONTENT_PARAMS,
  GCM_KEY_WRAP_IV_BYTES,
  GCM_KEY_WRAP_TAG_BYTES,
  hasEmptyEncryptedKey,
  isContentEncryptionAlgorithm,
  isEcdhAlgorithm,
  isGcmKeyWrapAlgorithm,
  isKeyManagementAlgorithm,
} from "./algorithms";
import type { ContentEncryptionAlgorithm, JweHeader } from "./types";

/** A compact JWE whose structure and header passed. Nothing in it is decrypted yet. */
export interface CompactJwe {
  /** The validated, deep-frozen protected header. */
  readonly header: JweHeader;
  /** The ASCII bytes of the encoded protected header, the additional authenticated data (RFC 7516 §5.1 step 14). */
  readonly aad: Uint8Array<ArrayBuffer>;
  readonly encryptedKey: Uint8Array<ArrayBuffer>;
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly ciphertext: Uint8Array<ArrayBuffer>;
  readonly tag: Uint8Array<ArrayBuffer>;
}

const SEGMENT_NAMES = ["header", "encrypted_key", "iv", "ciphertext", "tag"] as const;

/** Header members whose value, when present, must be text. */
const TEXT_MEMBERS = ["kid", "typ", "cty"] as const;

/** Header members whose value, when present, must be base64url text. */
const BASE64URL_MEMBERS = ["apu", "apv"] as const;

const ownMember = (header: object, name: string): unknown =>
  Object.hasOwn(header, name) ? (header as Record<string, unknown>)[name] : undefined;

/**
 * Checks a parsed JWE header, returning the first issue: an `alg` this package does not support, `RSA1_5` and
 * `PBES2-*` included, is `unsupported_alg`; an `enc` it does not support or the decrypter does not accept is
 * `unsupported_enc`; any `zip` is `malformed`, since decompressing is refused; any `crit` is `unsupported_crit`;
 * a `kid`, `typ` or `cty` that is not text, an `apu` or `apv` that is not base64url, an `ECDH-ES` header whose
 * `epk` is not an object, or an AES-GCM key wrap header whose `iv` is not 96 bits or `tag` not 128 bits of
 * base64url, is `malformed`. Every member is read from the protected header, the one header a compact JWE has, as
 * RFC 7518 §4.7.1 requires of `iv` and `tag` there.
 */
function headerIssue(header: object, accepted: ReadonlySet<ContentEncryptionAlgorithm>): JwtIssue | undefined {
  const alg = ownMember(header, "alg");
  if (!isKeyManagementAlgorithm(alg)) {
    return { code: "unsupported_alg", path: ["header", "alg"] };
  }
  const enc = ownMember(header, "enc");
  if (!isContentEncryptionAlgorithm(enc) || !accepted.has(enc)) {
    return { code: "unsupported_enc", path: ["header", "enc"] };
  }
  if (Object.hasOwn(header, "zip")) {
    return { code: "malformed", path: ["header", "zip"] };
  }
  if (Object.hasOwn(header, "crit")) {
    return { code: "unsupported_crit", path: ["header", "crit"] };
  }
  const notText = TEXT_MEMBERS.find(
    (name) => Object.hasOwn(header, name) && typeof ownMember(header, name) !== "string",
  );
  if (notText !== undefined) {
    return { code: "malformed", path: ["header", notText] };
  }
  const notBase64Url = BASE64URL_MEMBERS.find((name) => {
    if (!Object.hasOwn(header, name)) {
      return false;
    }
    const value = ownMember(header, name);
    return typeof value !== "string" || !isBase64Url(value);
  });
  if (notBase64Url !== undefined) {
    return { code: "malformed", path: ["header", notBase64Url] };
  }
  if (isEcdhAlgorithm(alg) && !isPlainObject(ownMember(header, "epk"))) {
    return { code: "malformed", path: ["header", "epk"] };
  }
  if (isGcmKeyWrapAlgorithm(alg)) {
    for (const [name, length] of [
      ["iv", GCM_KEY_WRAP_IV_BYTES],
      ["tag", GCM_KEY_WRAP_TAG_BYTES],
    ] as const) {
      const value = ownMember(header, name);
      if (typeof value !== "string" || decodeBase64Url(value)?.length !== length) {
        return { code: "malformed", path: ["header", name] };
      }
    }
  }
  return undefined;
}

/**
 * Splits and checks a compact JWE (RFC 7516 §7.1) up to, and not including, any cryptography: its type; its length,
 * before any other work; exactly five segments, each canonical base64url; a non-empty header, IV and tag; the
 * header's JSON, with no duplicate member, and its members; an encrypted key that is empty exactly when `alg` is
 * `dir` or `ECDH-ES`; and an IV and tag exactly as long as `enc` makes them.
 *
 * @returns The parsed token, or a failure with `malformed`, `too_large`, `duplicate_key`, `unsupported_alg`,
 * `unsupported_enc` or `unsupported_crit`. Never throws.
 */
export function parseCompactJwe(
  token: unknown,
  maxLength: number,
  accepted: ReadonlySet<ContentEncryptionAlgorithm>,
): JwtResult<CompactJwe> {
  if (typeof token !== "string") {
    return fail({ code: "malformed" });
  }
  if (token.length > maxLength) {
    return fail({ code: "too_large", params: { limit: "length", maximum: maxLength } });
  }
  const segments = token.split(".", 6);
  if (segments.length !== 5) {
    return fail({ code: "malformed" });
  }
  for (const [index, segment] of segments.entries()) {
    // The encrypted key and the ciphertext may be empty: `dir` has no encrypted key, and AES-GCM encrypts an
    // empty plaintext to an empty ciphertext.
    const mayBeEmpty = index === 1 || index === 3;
    if ((segment.length === 0 && !mayBeEmpty) || !isBase64Url(segment)) {
      return fail({ code: "malformed", path: [SEGMENT_NAMES[index] as string] });
    }
  }
  const [headerSegment, keySegment, ivSegment, ciphertextSegment, tagSegment] = segments as [
    string,
    string,
    string,
    string,
    string,
  ];
  const parsed = parseJsonObject(decodeBase64Url(headerSegment) as Uint8Array, ["header"]);
  if (!parsed.ok) {
    return parsed;
  }
  const issue = headerIssue(parsed.value, accepted);
  if (issue !== undefined) {
    return fail(issue);
  }
  const header = parsed.value as JweHeader;
  if ((keySegment.length === 0) !== hasEmptyEncryptedKey(header.alg)) {
    return fail({ code: "malformed", path: ["encrypted_key"] });
  }
  const params = CONTENT_PARAMS[header.enc];
  const iv = decodeBase64Url(ivSegment) as Uint8Array<ArrayBuffer>;
  if (iv.length !== params.ivBytes) {
    return fail({ code: "malformed", path: ["iv"] });
  }
  const tag = decodeBase64Url(tagSegment) as Uint8Array<ArrayBuffer>;
  if (tag.length !== params.tagBytes) {
    return fail({ code: "malformed", path: ["tag"] });
  }
  return ok({
    header,
    aad: encodeUtf8(headerSegment),
    encryptedKey: decodeBase64Url(keySegment) as Uint8Array<ArrayBuffer>,
    iv,
    ciphertext: decodeBase64Url(ciphertextSegment) as Uint8Array<ArrayBuffer>,
    tag,
  });
}
