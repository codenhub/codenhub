import type { AsymmetricAlgorithm, JwtIssue } from "../core/types";
import { decodeBase64Url, encodeBase64Url } from "../encoding";
import { ALGORITHM_PARAMS } from "./algorithms";
import {
  contentHex,
  CURVE_BY_OID,
  DER_BIT_STRING,
  DER_CONTEXT_0,
  DER_CONTEXT_1,
  DER_IMPLICIT_1,
  DER_INTEGER,
  DER_NULL,
  DER_OCTET_STRING,
  DER_OID,
  DER_SEQUENCE,
  encodeElement,
  type DerElement,
  hexBytes,
  isStrictDer,
  OID,
  readElement,
} from "./der";
import { exportMaterialJwk } from "./exported-jwk";

/**
 * Longest PEM text read, in characters. A PKCS#8 RSA 8192-bit key, the largest this package imports, is
 * about 6.4 KB, and a certificate for one with common extensions under 3 KB; the cap keeps a hostile
 * string from being scanned or decoded at any length.
 */
export const MAX_PEM_LENGTH = 16_384;

/**
 * One PEM block (RFC 7468 §2) and nothing else around it but whitespace: a label of capitals, digits and
 * spaces on both ends, and a body, which may hold RFC 1421 headers such as `DEK-Info`, read further by
 * {@link readPemBlock}.
 */
const PEM_PATTERN = /^-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END ([A-Z0-9 ]+)-----$/;

/** Base64 with any whitespace inside it, as RFC 7468 §3's lax parsing reads it. */
const BODY_PATTERN = /^[A-Za-z0-9+/=\s]*$/;

/** Standard base64 with canonical padding (RFC 4648 §4). */
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** An RFC 1421 header line, as OpenSSL writes before the body of a legacy encrypted key. */
const HEADER_PATTERN = /^[ \t]*[A-Za-z][A-Za-z0-9-]*:[^\n]*(?:\n|$)/;

/** RFC 1421's mark of an encrypted body: `Proc-Type: 4,ENCRYPTED`. */
const ENCRYPTED_HEADER_PATTERN = /^[ \t]*Proc-Type:[ \t]*4[ \t]*,[ \t]*ENCRYPTED[ \t]*$/im;

/** The labels of a private key, a private import's only input and a public import's refusal. */
const PRIVATE_LABELS: ReadonlySet<string> = new Set([
  "PRIVATE KEY",
  "RSA PRIVATE KEY",
  "EC PRIVATE KEY",
  "ENCRYPTED PRIVATE KEY",
]);

/** One PEM block, its body decoded. */
export interface PemBlock {
  readonly label: string;
  /** The DER of the body, or `undefined` when the body is not canonical base64. */
  readonly der: Uint8Array<ArrayBuffer> | undefined;
  /** Whether the body has RFC 1421 headers, which this package reads only to recognize encryption. */
  readonly hasHeaders: boolean;
  /** Whether the headers say `Proc-Type: 4,ENCRYPTED`. */
  readonly isEncrypted: boolean;
}

/**
 * Reads the one PEM block `pem` holds. A backslash never occurs in a PEM, so `\n` and `\r` written as escapes,
 * as a .env file or a JSON-encoded secret leaves them, are read as line breaks.
 *
 * @returns The block, or `undefined` when `pem` is longer than {@link MAX_PEM_LENGTH} or is not one block whose
 * labels match. Never throws.
 */
export function readPemBlock(pem: string): PemBlock | undefined {
  if (pem.length > MAX_PEM_LENGTH) {
    return undefined;
  }
  const match = PEM_PATTERN.exec(
    pem
      .replace(/\\[nr]/g, "\n")
      .replaceAll("\r", "")
      .trim(),
  );
  const [, label, rawBody, endLabel] = match ?? [];
  if (label === undefined || rawBody === undefined || label !== endLabel) {
    return undefined;
  }
  let body = rawBody.replace(/^[ \t]*\n/, "");
  let headers = "";
  for (let header = HEADER_PATTERN.exec(body); header !== null; header = HEADER_PATTERN.exec(body)) {
    headers += header[0];
    body = body.slice(header[0].length);
  }
  const base64 = BODY_PATTERN.test(body) ? body.replace(/\s/g, "") : undefined;
  const der =
    base64 !== undefined && BASE64_PATTERN.test(base64)
      ? decodeBase64Url(base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""))
      : undefined;
  return {
    label,
    der: der === undefined || der.length === 0 ? undefined : der,
    hasHeaders: headers !== "",
    isEncrypted: ENCRYPTED_HEADER_PATTERN.test(headers),
  };
}

/** `der` as a PEM block of `label`, its base64 in 64-character lines (RFC 7468 §2), ending with a line break. */
export function writePem(label: string, der: Uint8Array): string {
  const base64Url = encodeBase64Url(der);
  const base64 = base64Url.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return [`-----BEGIN ${label}-----`, ...lines, `-----END ${label}-----`, ""].join("\n");
}

/** A key read as the JWK of its material, or the one issue that refuses it. */
export type PemResult =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly issue: JwtIssue };

/** The DER Web Crypto imports, and its format, or the issue that refuses the block. */
type KeyDer = { readonly der: Uint8Array<ArrayBuffer>; readonly format: "spki" | "pkcs8" } | JwtIssue;

/** How each readable label becomes SPKI or PKCS#8 DER, with the role of the key it holds. */
const READERS: Readonly<
  Record<string, { readonly role: "public" | "private"; readonly read: (der: Uint8Array<ArrayBuffer>) => KeyDer }>
> = {
  "PUBLIC KEY": { role: "public", read: (der) => ({ der, format: "spki" }) },
  CERTIFICATE: {
    role: "public",
    read: (der) => {
      const spki = subjectPublicKeyInfo(der);
      return spki === undefined ? { code: "invalid_key" } : { der: spki, format: "spki" };
    },
  },
  "RSA PUBLIC KEY": { role: "public", read: (der) => ({ der: wrapSpki(rsaAlgorithm(), der), format: "spki" }) },
  "PRIVATE KEY": { role: "private", read: (der) => ({ der, format: "pkcs8" }) },
  "RSA PRIVATE KEY": { role: "private", read: (der) => ({ der: wrapPkcs8(rsaAlgorithm(), der), format: "pkcs8" }) },
  "EC PRIVATE KEY": { role: "private", read: readSec1 },
};

/**
 * Whether `der` is an SPKI or a PKCS#8 that Web Crypto engines all read alike: one `SEQUENCE` in strict DER to the
 * bottom ({@link isStrictDer}) with nothing after it, its fields in order and none other, and, for the algorithms
 * this package imports, the key's own DER inside it strict too: an RSA SPKI's `RSAPublicKey` in its `BIT STRING`,
 * and a PKCS#8's `RSAPrivateKey`, `ECPrivateKey` or 32-byte `CurvePrivateKey` (RFC 8410 §7) in its `OCTET STRING`.
 * A PKCS#1 or SEC 1 key is read here once wrapped. Engines disagree on the rest: Node imports an SPKI with bytes
 * after it and browsers refuse it, Firefox alone imports a PKCS#8 with a byte after it, Node and WebKit alone a
 * length that is not minimal, outer or inner, or indefinite, Node alone an RSA modulus with an extra zero byte or
 * an Ed25519 private key with a byte after it, and WebKit reads a negative modulus as another.
 */
function isStrictKey(der: Uint8Array, format: "spki" | "pkcs8"): boolean {
  const outer = readElement(der, 0, der.length, true);
  if (outer?.tag !== DER_SEQUENCE || outer.end !== der.length || !isStrictDer(der, 0, der.length)) {
    return false;
  }
  let algorithm = readElement(der, outer.contentStart, outer.end);
  if (format === "pkcs8") {
    algorithm = algorithm?.tag === DER_INTEGER ? readElement(der, algorithm.end, outer.end) : undefined;
  }
  const oid = algorithm?.tag === DER_SEQUENCE ? readElement(der, algorithm.contentStart, algorithm.end) : undefined;
  const key = algorithm === undefined ? undefined : readElement(der, algorithm.end, outer.end);
  if (oid?.tag !== DER_OID || key === undefined) {
    return false;
  }
  const oidHex = contentHex(der, oid);
  const isRsa = oidHex === OID.rsaEncryption || oidHex === OID.rsassaPss;
  if (format === "spki") {
    // The BIT STRING's first byte, its unused bits, is 0: isStrictDer read it.
    return key.tag === DER_BIT_STRING && key.end === outer.end && (!isRsa || isOneStrict(der, key, 1, DER_SEQUENCE));
  }
  if (key.tag !== DER_OCTET_STRING || !hasOnlyPkcs8Trailer(der, key.end, outer.end)) {
    return false;
  }
  if (isRsa || oidHex === OID.ecPublicKey) {
    return isOneStrict(der, key, 0, DER_SEQUENCE);
  }
  if (oidHex === OID.ed25519 || oidHex === OID.x25519) {
    return isOneStrict(der, key, 0, DER_OCTET_STRING) && key.end - key.contentStart === 34;
  }
  return true;
}

/** Whether the content of `outer`, after its first `skip` bytes, is exactly one element of `tag` in strict DER. */
function isOneStrict(der: Uint8Array, outer: DerElement, skip: number, tag: number): boolean {
  const start = outer.contentStart + skip;
  const inner = readElement(der, start, outer.end, true);
  return inner?.tag === tag && inner.end === outer.end && isStrictDer(der, start, outer.end);
}

/** Whether what follows a PKCS#8's private key is at most its `[0]` attributes, then its `[1]` public key (RFC 5958). */
function hasOnlyPkcs8Trailer(der: Uint8Array, start: number, end: number): boolean {
  let offset = start;
  for (const tag of [DER_CONTEXT_0, DER_IMPLICIT_1]) {
    const field = offset < end ? readElement(der, offset, end) : undefined;
    if (field?.tag === tag) {
      offset = field.end;
    }
  }
  return offset === end;
}

/**
 * Reads a PEM key as the JWK of its material, for the JWK checks to run on exactly as on a JWK given directly:
 * a `PUBLIC KEY` (SPKI), a `CERTIFICATE` (the SPKI inside it) or an `RSA PUBLIC KEY` (PKCS#1) for a public key,
 * and a `PRIVATE KEY` (PKCS#8), an `RSA PRIVATE KEY` (PKCS#1) or an `EC PRIVATE KEY` (SEC 1) for a private key.
 * PKCS#1 and SEC 1 are wrapped into SPKI or PKCS#8 first. Web Crypto parses the key's DER: it is imported for
 * `alg`, and exported again as a JWK.
 *
 * @returns The JWK, with `kid` when one is given; `unexpected_private_key` for a private key where a public one
 * is expected; `invalid_key` with `{ reason: "encrypted" }` for an encrypted key, and with
 * `{ reason: "unsupported_format" }` for a label or a form this package does not read; `unsupported_key` at
 * `["kty"]` or `["crv"]` for a key of another type or curve than `alg`; otherwise `invalid_key` for anything
 * that is not one well-formed block of the expected role. Never throws, and an issue never quotes the input.
 */
export async function pemToJwk(
  pem: string,
  alg: AsymmetricAlgorithm,
  role: "public" | "private",
  kid: string | undefined,
): Promise<PemResult> {
  const key = readPemDer(pem, role);
  if (!key.ok) {
    return key;
  }
  const format = role === "public" ? "spki" : "pkcs8";
  const typeIssue = keyTypeIssue(key.value, format, alg);
  if (typeIssue !== undefined) {
    return { ok: false, issue: typeIssue };
  }
  try {
    const { importParams } = ALGORITHM_PARAMS[alg];
    const cryptoKey = await crypto.subtle.importKey(format, key.value, importParams, true, [
      role === "public" ? "verify" : "sign",
    ]);
    return { ok: true, value: await exportMaterialJwk(cryptoKey, alg, kid) };
  } catch {
    // Web Crypto rejects DER it cannot read; its message may quote it.
    return { ok: false, issue: { code: "invalid_key" } };
  }
}

/** The DER a PEM holds, or the one issue that refuses it. */
export type PemDerResult =
  | { readonly ok: true; readonly value: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly issue: JwtIssue };

/**
 * Reads the DER of one PEM key block: SPKI for the `public` role, from a `PUBLIC KEY`, a `CERTIFICATE`'s key or an
 * `RSA PUBLIC KEY`, and PKCS#8 for the `private` role, from a `PRIVATE KEY`, an `RSA PRIVATE KEY` or an
 * `EC PRIVATE KEY`, with PKCS#1 and SEC 1 wrapped first. The DER is read strictly to the bottom, as
 * {@link isStrictKey} says, so that every Web Crypto engine imports the same key from it or none does.
 *
 * @returns The DER, or the issues {@link pemToJwk} names for the block itself: `unexpected_private_key`,
 * `invalid_key` with `{ reason: "encrypted" }` or `{ reason: "unsupported_format" }`, or a plain `invalid_key`.
 * Never throws, and an issue never quotes the input.
 */
export function readPemDer(pem: string, role: "public" | "private"): PemDerResult {
  const invalid = (reason?: "encrypted" | "unsupported_format"): PemDerResult => ({
    ok: false,
    issue: { code: "invalid_key", ...(reason === undefined ? {} : { params: { reason } }) },
  });
  const block = readPemBlock(pem);
  if (block === undefined) {
    return invalid();
  }
  if (PRIVATE_LABELS.has(block.label) && role === "public") {
    return { ok: false, issue: { code: "unexpected_private_key" } };
  }
  if (block.label === "ENCRYPTED PRIVATE KEY" || block.isEncrypted) {
    return invalid("encrypted");
  }
  const reader = READERS[block.label];
  if (reader === undefined || block.hasHeaders) {
    return invalid("unsupported_format");
  }
  if (reader.role !== role || block.der === undefined) {
    return invalid();
  }
  const key = reader.read(block.der);
  if ("code" in key) {
    return { ok: false, issue: key };
  }
  return isStrictKey(key.der, key.format) ? { ok: true, value: key.der } : invalid();
}

/** The `AlgorithmIdentifier` of an RSA key: `rsaEncryption` with `NULL` parameters (RFC 8017 Appendix A.1). */
function rsaAlgorithm(): Uint8Array<ArrayBuffer> {
  return encodeElement(DER_SEQUENCE, encodeElement(DER_OID, hexBytes(OID.rsaEncryption)), Uint8Array.of(DER_NULL, 0));
}

/** A `SubjectPublicKeyInfo` (RFC 5280 §4.1) of `algorithm` around the key's own DER. */
function wrapSpki(algorithm: Uint8Array, key: Uint8Array): Uint8Array<ArrayBuffer> {
  return encodeElement(DER_SEQUENCE, algorithm, encodeElement(DER_BIT_STRING, Uint8Array.of(0), key));
}

/** A version 0 `PrivateKeyInfo` (RFC 5208 §5) of `algorithm` around the key's own DER. */
function wrapPkcs8(algorithm: Uint8Array, key: Uint8Array): Uint8Array<ArrayBuffer> {
  return encodeElement(DER_SEQUENCE, Uint8Array.of(DER_INTEGER, 1, 0), algorithm, encodeElement(DER_OCTET_STRING, key));
}

/**
 * An `ECPrivateKey` (RFC 5915 §3) wrapped into PKCS#8 under the curve its `[0]` parameters name. It is read
 * strictly: version 1, a private key, the parameters as one named-curve OID, an optional `[1]` public key, and
 * nothing else. Without parameters the curve is unknown, so the key is refused as an unsupported form.
 */
function readSec1(der: Uint8Array<ArrayBuffer>): KeyDer {
  const malformed: JwtIssue = { code: "invalid_key" };
  const sequence = readElement(der, 0, der.length, true);
  if (sequence?.tag !== DER_SEQUENCE || sequence.end !== der.length) {
    return malformed;
  }
  const version = readElement(der, sequence.contentStart, sequence.end, true);
  if (version?.tag !== DER_INTEGER || contentHex(der, version) !== "01") {
    return malformed;
  }
  const privateKey = readElement(der, version.end, sequence.end, true);
  if (privateKey?.tag !== DER_OCTET_STRING || privateKey.end === privateKey.contentStart) {
    return malformed;
  }
  const parameters = privateKey.end === sequence.end ? undefined : readElement(der, privateKey.end, sequence.end, true);
  if (parameters?.tag !== DER_CONTEXT_0) {
    const isWellFormed =
      privateKey.end === sequence.end || (parameters?.tag === DER_CONTEXT_1 && parameters.end === sequence.end);
    return isWellFormed ? { code: "invalid_key", params: { reason: "unsupported_format" } } : malformed;
  }
  const curve = readElement(der, parameters.contentStart, parameters.end, true);
  if (curve?.tag !== DER_OID || curve.end !== parameters.end || curve.end === curve.contentStart) {
    return malformed;
  }
  if (parameters.end !== sequence.end) {
    const publicKey = readElement(der, parameters.end, sequence.end, true);
    if (publicKey?.tag !== DER_CONTEXT_1 || publicKey.end !== sequence.end) {
      return malformed;
    }
  }
  const algorithm = encodeElement(
    DER_SEQUENCE,
    encodeElement(DER_OID, hexBytes(OID.ecPublicKey)),
    der.subarray(curve.start, curve.end),
  );
  return { der: wrapPkcs8(algorithm, der), format: "pkcs8" };
}

/**
 * `unsupported_key` at `["kty"]` or `["crv"]` when the key's `AlgorithmIdentifier` names another type or curve
 * than `alg` takes, as the JWK checks report it; `undefined` when it fits, or when the DER is too malformed to
 * tell, which Web Crypto then refuses.
 */
function keyTypeIssue(der: Uint8Array, format: "spki" | "pkcs8", alg: AsymmetricAlgorithm): JwtIssue | undefined {
  const { kty, crv } = ALGORITHM_PARAMS[alg];
  return pemKeyIssue(readKeyType(der, format), kty, crv === undefined ? undefined : [crv]);
}

/**
 * The key type and curve the `AlgorithmIdentifier` of an SPKI or PKCS#8 names: `RSA` for `rsaEncryption` and
 * RSASSA-PSS, `EC` with its named curve, `OKP` for Ed25519 and X25519. `undefined` when the DER is not one Web
 * Crypto could import either, which then refuses it itself; `kty` is `undefined` for an algorithm not listed.
 */
export function readKeyType(
  der: Uint8Array,
  format: "spki" | "pkcs8",
): { readonly kty: string | undefined; readonly crv: string | undefined } | undefined {
  const outer = readElement(der, 0, der.length);
  if (outer?.tag !== DER_SEQUENCE) {
    return undefined;
  }
  let algorithm = readElement(der, outer.contentStart, outer.end);
  if (format === "pkcs8") {
    algorithm = algorithm?.tag === DER_INTEGER ? readElement(der, algorithm.end, outer.end) : undefined;
  }
  const oid = algorithm?.tag === DER_SEQUENCE ? readElement(der, algorithm.contentStart, algorithm.end) : undefined;
  if (algorithm === undefined || oid?.tag !== DER_OID) {
    return undefined;
  }
  const parameters = readElement(der, oid.end, algorithm.end);
  const oidHex = contentHex(der, oid);
  if (oidHex === OID.rsaEncryption || oidHex === OID.rsassaPss) {
    return { kty: "RSA", crv: undefined };
  }
  if (oidHex === OID.ecPublicKey) {
    return { kty: "EC", crv: parameters?.tag === DER_OID ? CURVE_BY_OID[contentHex(der, parameters)] : undefined };
  }
  if (oidHex === OID.ed25519 || oidHex === OID.x25519) {
    return { kty: "OKP", crv: oidHex === OID.ed25519 ? "Ed25519" : "X25519" };
  }
  return { kty: undefined, crv: undefined };
}

/**
 * `unsupported_key` at `["kty"]` when a PEM key read by {@link readKeyType} is not of type `kty`, or at
 * `["crv"]` when `curves` is given and its curve is not one of them; `undefined` when it fits, or could not be read.
 */
export function pemKeyIssue(
  read: ReturnType<typeof readKeyType>,
  kty: string,
  curves: readonly string[] | undefined,
): JwtIssue | undefined {
  if (read === undefined) {
    return undefined;
  }
  if (read.kty !== kty) {
    return { code: "unsupported_key", path: ["kty"] };
  }
  return curves !== undefined && (read.crv === undefined || !curves.includes(read.crv))
    ? { code: "unsupported_key", path: ["crv"] }
    : undefined;
}

/** RFC 5280 §4.1: the fields of a `TBSCertificate` before `subjectPublicKeyInfo`, after the version. */
const FIELDS_BEFORE_KEY = [DER_SEQUENCE, DER_SEQUENCE, DER_SEQUENCE, DER_SEQUENCE] as const;

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
  if (field?.tag === DER_CONTEXT_0) {
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

/**
 * Whether `der` is exactly one DER `SEQUENCE`, as a certificate or a key is, its length in the minimal form and
 * nothing after it; its content is not read.
 */
export function isSingleSequence(der: Uint8Array): boolean {
  const element = readElement(der, 0, der.length, true);
  return element?.tag === DER_SEQUENCE && element.end === der.length;
}
