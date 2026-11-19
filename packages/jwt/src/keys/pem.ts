import type { AsymmetricAlgorithm, JwtIssue } from "../core/types";
import { decodeBase64Url } from "../encoding";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportMaterialJwk } from "./exported-jwk";

/**
 * Longest PEM text read, in characters. A PKCS#8 RSA 8192-bit key, the largest this package imports, is
 * about 6.4 KB, and a certificate for one with common extensions under 3 KB; the cap keeps a hostile
 * string from being scanned or decoded at any length.
 */
export const MAX_PEM_LENGTH = 16_384;

/**
 * One PEM block (RFC 7468 §2) and nothing else around it but whitespace: its label, then base64 with any
 * whitespace inside it, as RFC 7468 §3's lax parsing reads it. A PEM kept in an environment variable often
 * arrives on one line, its line breaks turned into spaces or dropped. The label must match on both ends, and
 * only the two key labels Web Crypto reads, and `CERTIFICATE`, are recognized.
 */
const PEM_PATTERN =
  /^-----BEGIN (PUBLIC KEY|PRIVATE KEY|CERTIFICATE)-----([A-Za-z0-9+/=\s]+)-----END (PUBLIC KEY|PRIVATE KEY|CERTIFICATE)-----$/;

/** Standard base64 with canonical padding (RFC 4648 §4). */
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** A PEM key read as a JWK, or the one issue that refuses it. */
export type PemResult =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly issue: JwtIssue };

/**
 * Reads a PEM `PUBLIC KEY` (SPKI), `CERTIFICATE` (the SPKI inside it) or `PRIVATE KEY` (PKCS#8) as the JWK
 * of its material, for the JWK checks to run on exactly as on a JWK given directly. Web Crypto parses the
 * key's DER: it is imported for `alg`, and exported again as a JWK.
 *
 * @returns The JWK, with `kid` when one is given; `unexpected_private_key` for a private key where a public
 * one is expected; otherwise `invalid_key` for anything that is not one well-formed block of the expected
 * label holding a key of `alg`'s type. Never throws, and an issue never quotes the input.
 */
export async function pemToJwk(
  pem: string,
  alg: AsymmetricAlgorithm,
  role: "public" | "private",
  kid: string | undefined,
): Promise<PemResult> {
  const invalid: PemResult = { ok: false, issue: { code: "invalid_key" } };
  if (pem.length > MAX_PEM_LENGTH) {
    return invalid;
  }
  const match = PEM_PATTERN.exec(pem.trim());
  const [, label, body, endLabel] = match ?? [];
  if (label === undefined || body === undefined || label !== endLabel) {
    return invalid;
  }
  if (label === "PRIVATE KEY" && role === "public") {
    return { ok: false, issue: { code: "unexpected_private_key" } };
  }
  if (label !== "PRIVATE KEY" && role === "private") {
    return invalid;
  }
  const base64 = body.replace(/\s/g, "");
  const decoded = BASE64_PATTERN.test(base64)
    ? decodeBase64Url(base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""))
    : undefined;
  const der = decoded !== undefined && label === "CERTIFICATE" ? subjectPublicKeyInfo(decoded) : decoded;
  if (der === undefined || der.length === 0) {
    return invalid;
  }
  try {
    const { importParams } = ALGORITHM_PARAMS[alg];
    const format = role === "public" ? "spki" : "pkcs8";
    const cryptoKey = await crypto.subtle.importKey(format, der, importParams, true, [
      role === "public" ? "verify" : "sign",
    ]);
    return { ok: true, value: await exportMaterialJwk(cryptoKey, alg, kid) };
  } catch {
    // Web Crypto rejects DER it cannot read or a key of another type or curve; its message may quote it.
    return invalid;
  }
}

const DER_SEQUENCE = 0x30;
const DER_INTEGER = 0x02;
/** `[0] EXPLICIT`, the tag of a certificate's optional version field. */
const DER_VERSION = 0xa0;
/** Longest DER length field read, in bytes; four already exceed any PEM this module accepts. */
const MAX_DER_LENGTH_BYTES = 4;
/** RFC 5280 §4.1: the fields of a `TBSCertificate` before `subjectPublicKeyInfo`, after the version. */
const FIELDS_BEFORE_KEY = [DER_SEQUENCE, DER_SEQUENCE, DER_SEQUENCE, DER_SEQUENCE] as const;

interface DerElement {
  readonly tag: number;
  readonly start: number;
  readonly contentStart: number;
  readonly end: number;
}

/** Reads the DER element at `offset`, which must end by `limit`; `undefined` for anything malformed. */
function readElement(der: Uint8Array, offset: number, limit: number): DerElement | undefined {
  if (offset + 2 > limit) {
    return undefined;
  }
  const tag = der[offset] as number;
  const first = der[offset + 1] as number;
  let length = first;
  let contentStart = offset + 2;
  if (first >= 0x80) {
    const count = first & 0x7f;
    if (count === 0 || count > MAX_DER_LENGTH_BYTES || contentStart + count > limit) {
      return undefined;
    }
    length = 0;
    for (let index = 0; index < count; index++) {
      length = length * 256 + (der[contentStart + index] as number);
    }
    contentStart += count;
  }
  const end = contentStart + length;
  return end > limit ? undefined : { tag, start: offset, contentStart, end };
}

/**
 * The DER of the `subjectPublicKeyInfo` in an X.509 certificate (RFC 5280 §4.1), found by walking the
 * fields before it. Nothing else is read: not the version, validity, extensions or signature.
 */
function subjectPublicKeyInfo(der: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> | undefined {
  const certificate = readElement(der, 0, der.length);
  if (certificate?.tag !== DER_SEQUENCE || certificate.end !== der.length) {
    return undefined;
  }
  const tbs = readElement(der, certificate.contentStart, certificate.end);
  if (tbs?.tag !== DER_SEQUENCE) {
    return undefined;
  }
  let field = readElement(der, tbs.contentStart, tbs.end);
  if (field?.tag === DER_VERSION) {
    field = readElement(der, field.end, tbs.end);
  }
  if (field?.tag !== DER_INTEGER) {
    return undefined;
  }
  for (const tag of FIELDS_BEFORE_KEY) {
    field = readElement(der, field.end, tbs.end);
    if (field?.tag !== tag) {
      return undefined;
    }
  }
  const key = readElement(der, field.end, tbs.end);
  return key?.tag === DER_SEQUENCE ? der.subarray(key.start, key.end) : undefined;
}
