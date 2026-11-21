import { rejectUnknownOptions } from "../core/options";
import { isPlainObject } from "../core/plain";
import type { JwtPayload } from "../core/types";
import { encodeBase64Url } from "../encoding/base64url";
import { copyBytes, isUint8Array } from "../encoding/bytes";
import { encodeUtf8 } from "../encoding/text";
import { sign, snapshotJsonObject, type SignInput } from "../sign/sign";
import { CONTENT_ENCRYPTION_ALGORITHMS, isContentEncryptionAlgorithm } from "./algorithms";
import { encryptContent } from "./content";
import { wrapContentKey, type ManagedKey } from "./key-management";
import { getJweKeyEntry } from "./registry";
import type { ContentEncryptionAlgorithm, JweEncryptionKey, KeyManagementAlgorithm } from "./types";

/** Header parameters a caller may set when encrypting. `alg` comes from the key, and `enc` from the input. */
export interface EncryptHeader {
  /** The key's algorithm. It may be repeated here, but never changed. */
  readonly alg?: KeyManagementAlgorithm;
  /** The content encryption algorithm. It may be repeated here, but never changed. */
  readonly enc?: ContentEncryptionAlgorithm;
  /**
   * Key identifier the recipient selects its key by.
   *
   * @defaultValue the encryption key's `kid`, or none
   */
  readonly kid?: string;
  /** Media type of the whole token. */
  readonly typ?: string;
  /** Media type of the plaintext. */
  readonly cty?: string;
  /**
   * Any other JSON header parameter. Members that change how a token is decrypted, or ask the recipient to trust
   * a key, are refused: `crit`, `zip`, `epk`, `apu`, `apv`, `iv`, `tag`, `p2s`, `p2c`, `b64`, `jwk`, `jku`, `x5u`
   * and `x5c`.
   */
  readonly [parameter: string]: unknown;
}

/** What {@link encrypt} encrypts, and how. */
export interface EncryptInput {
  /** The bytes to encrypt, or text, encrypted as its UTF-8 bytes. */
  readonly plaintext: Uint8Array | string;
  /** A JWE public or secret key this package created. It fixes the token's `alg`. */
  readonly key: JweEncryptionKey;
  /**
   * The content encryption algorithm. Required, except with a `dir` key, which is bound to one already and
   * allows only that one here.
   *
   * @defaultValue the `dir` key's `enc`
   */
  readonly enc?: ContentEncryptionAlgorithm;
  /** Extra protected header parameters. */
  readonly header?: EncryptHeader;
}

/** What {@link encryptJwt} signs, then encrypts. */
export interface EncryptJwtInput<TPayload extends object = JwtPayload> {
  /** The token to sign first, exactly as {@link sign} takes it. */
  readonly sign: SignInput<TPayload>;
  /** The key to encrypt the signed token with. */
  readonly key: JweEncryptionKey;
  /** The content encryption algorithm, as for {@link EncryptInput.enc}. */
  readonly enc?: ContentEncryptionAlgorithm;
  /** Extra protected header parameters of the outer JWE. `cty` is always `JWT` and may only repeat it. */
  readonly header?: EncryptHeader;
}

const INPUT_MEMBERS: Readonly<Record<keyof EncryptInput, true>> = {
  plaintext: true,
  key: true,
  enc: true,
  header: true,
};
const JWT_INPUT_MEMBERS: Readonly<Record<keyof EncryptJwtInput, true>> = {
  sign: true,
  key: true,
  enc: true,
  header: true,
};

/**
 * Header parameters the sender never writes: those the encryption itself sets (`epk`, `iv`, `tag`), those this
 * package refuses to read (`crit`, `zip`, the PBES2 parameters), those `encrypt` does not write (`apu`, `apv`),
 * and those that ask the recipient to trust something other than its own keys.
 */
const FORBIDDEN_HEADER_MEMBERS = [
  "crit",
  "zip",
  "epk",
  "apu",
  "apv",
  "iv",
  "tag",
  "p2s",
  "p2c",
  "b64",
  "jwk",
  "jku",
  "x5u",
  "x5c",
] as const;

const TEXT_HEADER_MEMBERS = ["kid", "typ", "cty"] as const;

/**
 * Encrypts bytes or text into a compact JWE (RFC 7516 §7.1).
 *
 * @remarks
 * `alg` comes from the key, never from the input: an `RSA-OAEP-256` public key always makes an `RSA-OAEP-256`
 * token. A fresh random content key and IV are drawn for each token, except with `dir`, where the key is the
 * content key. The protected header, written with `alg`, `enc`, `kid`, `typ`, `cty` and `epk` first, is the
 * additional authenticated data, so changing any byte of it fails decryption.
 *
 * @example
 * ```ts
 * const token = await encrypt({ plaintext: "hello", key: recipientPublicKey, enc: "A256GCM" });
 * ```
 *
 * @returns The compact token.
 * @throws TypeError when `input` is not an object or has a member that is not one of its own; `key` is not a JWE
 * public or secret key this package created, a JWS key included; `enc` is missing, unsupported, or differs from a
 * `dir` key's; `plaintext` is neither a `Uint8Array` nor a string; or `header` is not a plain object of JSON
 * values, repeats `alg` or `enc` with another value, holds a refused member, or has a `kid`, `typ` or `cty` that
 * is not a string.
 */
export async function encrypt(input: EncryptInput): Promise<string> {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("encrypt: input must be an object.");
  }
  rejectUnknownOptions(input, INPUT_MEMBERS, "encrypt", "input");
  const plaintext = readPlaintext(input.plaintext);
  const prepared = prepareEncryption(input.key, input.enc, input.header, "encrypt", undefined);
  return encryptBytes(plaintext, prepared);
}

/**
 * Signs a JWT with {@link sign}, then encrypts the signed token with `cty: "JWT"` (RFC 7519 §5.2), for a recipient
 * that decrypts and verifies it with {@link createNestedVerifier}. Signing first, then encrypting, is the order
 * RFC 7519 §11.2 recommends: the signature stays verifiable by the recipient alone.
 *
 * @example
 * ```ts
 * const token = await encryptJwt({
 *   sign: { payload: { sub: "user-1", exp }, key: signingKey },
 *   key: recipientPublicKey,
 *   enc: "A256GCM",
 * });
 * ```
 *
 * @returns The compact JWE holding the signed token.
 * @throws TypeError as {@link sign} does for `input.sign`, and as {@link encrypt} does for the rest, also when
 * `header.cty` is anything but `JWT`. The encryption half is checked first, so a mistake there never calls the
 * signer.
 */
export async function encryptJwt<TPayload extends object = JwtPayload>(
  input: EncryptJwtInput<TPayload>,
): Promise<string> {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("encryptJwt: input must be an object.");
  }
  rejectUnknownOptions(input, JWT_INPUT_MEMBERS, "encryptJwt", "input");
  // Checked before signing, so a mistake in the encryption half never costs a signature, which an external
  // signer may bill for.
  const prepared = prepareEncryption(input.key, input.enc, input.header, "encryptJwt", "JWT");
  const signed = await sign(input.sign);
  return encryptBytes(encodeUtf8(signed), prepared);
}

interface PreparedEncryption {
  readonly key: JweEncryptionKey;
  readonly entry: ReturnType<typeof getJweKeyEntry>;
  readonly enc: ContentEncryptionAlgorithm;
  readonly given: Readonly<Record<string, unknown>>;
  readonly cty: "JWT" | undefined;
}

function prepareEncryption(
  key: JweEncryptionKey,
  encOption: unknown,
  header: unknown,
  functionName: string,
  cty: "JWT" | undefined,
): PreparedEncryption {
  const entry = getJweKeyEntry(key, functionName);
  if (key.kind !== "jwe-public" && key.kind !== "jwe-secret") {
    throw new TypeError(`${functionName}: input.key must be a JWE public or secret key, not a private key.`);
  }
  const enc = readEnc(encOption, key, functionName);
  const given = readHeader(header, key.alg, enc, functionName);
  if (cty !== undefined && Object.hasOwn(given, "cty") && given.cty !== cty) {
    throw new TypeError(`${functionName}: input.header.cty must be "${cty}" or absent.`);
  }
  return { key, entry, enc, given, cty };
}

async function encryptBytes(
  plaintext: Uint8Array<ArrayBuffer>,
  { key, entry, enc, given, cty }: PreparedEncryption,
): Promise<string> {
  const managed = await wrapContentKey(key.alg, enc, entry);
  const headerJson = serializeHeader(given, key, enc, cty, managed);
  const headerSegment = encodeBase64Url(encodeUtf8(headerJson));
  const content = await encryptContent(enc, managed.contentKey, plaintext, encodeUtf8(headerSegment));
  return [
    headerSegment,
    encodeBase64Url(managed.encryptedKey),
    encodeBase64Url(content.iv),
    encodeBase64Url(content.ciphertext),
    encodeBase64Url(content.tag),
  ].join(".");
}

function readPlaintext(plaintext: unknown): Uint8Array<ArrayBuffer> {
  if (typeof plaintext === "string") {
    return encodeUtf8(plaintext);
  }
  const bytes = isUint8Array(plaintext) ? copyBytes(plaintext) : undefined;
  if (bytes === undefined) {
    throw new TypeError("encrypt: input.plaintext must be a Uint8Array or a string.");
  }
  return bytes;
}

function readEnc(enc: unknown, key: JweEncryptionKey, functionName: string): ContentEncryptionAlgorithm {
  if (key.kind === "jwe-secret" && key.alg === "dir") {
    if (enc !== undefined && enc !== key.enc) {
      throw new TypeError(`${functionName}: input.enc must equal the dir key's enc, ${key.enc}.`);
    }
    return key.enc as ContentEncryptionAlgorithm;
  }
  if (!isContentEncryptionAlgorithm(enc)) {
    throw new TypeError(`${functionName}: input.enc must be one of ${CONTENT_ENCRYPTION_ALGORITHMS.join(", ")}.`);
  }
  return enc;
}

function readHeader(
  header: unknown,
  alg: KeyManagementAlgorithm,
  enc: ContentEncryptionAlgorithm,
  functionName: string,
): Record<string, unknown> {
  if (header !== undefined && !isPlainObject(header)) {
    throw new TypeError(`${functionName}: input.header must be a plain object.`);
  }
  // Read once into a copy, so a getter or Proxy cannot show the checks one header and the token another.
  const given = header === undefined ? {} : snapshotJsonObject(header, "input.header", functionName);
  if (Object.hasOwn(given, "alg") && given.alg !== alg) {
    throw new TypeError(`${functionName}: input.header.alg must equal the key's alg.`);
  }
  if (Object.hasOwn(given, "enc") && given.enc !== enc) {
    throw new TypeError(`${functionName}: input.header.enc must equal input.enc.`);
  }
  const forbidden = FORBIDDEN_HEADER_MEMBERS.find((name) => Object.hasOwn(given, name));
  if (forbidden !== undefined) {
    throw new TypeError(`${functionName}: input.header.${forbidden} is not supported.`);
  }
  const notText = TEXT_HEADER_MEMBERS.find((name) => Object.hasOwn(given, name) && typeof given[name] !== "string");
  if (notText !== undefined) {
    throw new TypeError(`${functionName}: input.header.${notText} must be a string.`);
  }
  return given;
}

/**
 * Writes the header as JSON with `alg`, `enc`, `kid`, `typ`, `cty`, then the members key management sets
 * (`epk`, or `iv` and `tag`), then the caller's others.
 */
function serializeHeader(
  given: Record<string, unknown>,
  key: JweEncryptionKey,
  enc: ContentEncryptionAlgorithm,
  cty: string | undefined,
  managed: ManagedKey,
): string {
  const members: [string, unknown][] = [
    ["alg", key.alg],
    ["enc", enc],
  ];
  const kid = Object.hasOwn(given, "kid") ? given.kid : key.kid;
  if (kid !== undefined) {
    members.push(["kid", kid]);
  }
  if (Object.hasOwn(given, "typ")) {
    members.push(["typ", given.typ]);
  }
  const contentType = cty ?? (Object.hasOwn(given, "cty") ? given.cty : undefined);
  if (contentType !== undefined) {
    members.push(["cty", contentType]);
  }
  if (managed.epk !== undefined) {
    members.push(["epk", managed.epk]);
  }
  if (managed.gcm !== undefined) {
    members.push(["iv", managed.gcm.iv], ["tag", managed.gcm.tag]);
  }
  const leading: readonly string[] = ["alg", "enc", ...TEXT_HEADER_MEMBERS];
  for (const [name, value] of Object.entries(given)) {
    if (!leading.includes(name)) {
      members.push([name, value]);
    }
  }
  // Written member by member: an object would list integer-like names before `alg`.
  return `{${members.map(([name, value]) => `${JSON.stringify(name)}:${JSON.stringify(value)}`).join(",")}}`;
}
