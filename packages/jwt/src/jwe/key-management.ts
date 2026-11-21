import type { JwtIssue } from "../core/types";
import { decodeBase64Url, encodeBase64Url, encodeUtf8 } from "../encoding";
import {
  CONTENT_PARAMS,
  CURVE_PARAMS,
  GCM_KEY_WRAP_IV_BYTES,
  GCM_KEY_WRAP_TAG_BYTES,
  isEcdhAlgorithm,
  isGcmKeyWrapAlgorithm,
  isRsaAlgorithm,
  KEY_WRAP_BYTES,
  OAEP_HASH,
  type EcdhKeyManagementAlgorithm,
  type RsaKeyManagementAlgorithm,
} from "./algorithms";
import { concatBytes, importContentKey, type ContentKey } from "./content";
import type { JweKeyEntry } from "./registry";
import type { ContentEncryptionAlgorithm, JweCurve, JweHeader, KeyManagementAlgorithm } from "./types";

/**
 * What key management gives the sender: the content key, the encrypted key segment, and the header members it
 * sets: `epk` for the `ECDH-ES` algorithms, `iv` and `tag` for the AES-GCM key wraps.
 */
export interface ManagedKey {
  readonly contentKey: ContentKey;
  readonly encryptedKey: Uint8Array<ArrayBuffer>;
  readonly epk?: Readonly<Record<string, string>>;
  readonly gcm?: { readonly iv: string; readonly tag: string };
}

/** The HMAC container a raw content key is wrapped and unwrapped as: it accepts any length, unlike AES. */
const RAW_KEY_CONTAINER: HmacImportParams = { name: "HMAC", hash: "SHA-256" };

const EMPTY = new Uint8Array(0);

/**
 * Makes the content key for a new token and protects it for the recipient (RFC 7516 §5.1 steps 1–6).
 *
 * @param entry - The material of an encryption key bound to `alg`.
 */
export async function wrapContentKey(
  alg: KeyManagementAlgorithm,
  enc: ContentEncryptionAlgorithm,
  entry: JweKeyEntry,
): Promise<ManagedKey> {
  if (alg === "dir") {
    return { contentKey: entry.contentKey as ContentKey, encryptedKey: EMPTY };
  }
  const keyBytes = CONTENT_PARAMS[enc].keyBytes;
  if (isEcdhAlgorithm(alg)) {
    const curve = entry.curve as JweCurve;
    const { importParams } = CURVE_PARAMS[curve];
    const ephemeral = (await crypto.subtle.generateKey(importParams, true, ["deriveBits"])) as CryptoKeyPair;
    const derived = await agreeAndDerive(
      alg,
      enc,
      curve,
      ephemeral.privateKey,
      entry.cryptoKey as CryptoKey,
      EMPTY,
      EMPTY,
    );
    const epk = await ephemeralPublicJwk(ephemeral.publicKey, curve);
    if (alg === "ECDH-ES") {
      return { contentKey: await importContentKey(enc, derived, false), encryptedKey: EMPTY, epk };
    }
    const cek = crypto.getRandomValues(new Uint8Array(keyBytes));
    const kek = await crypto.subtle.importKey("raw", derived, "AES-KW", false, ["wrapKey"]);
    return { contentKey: await importContentKey(enc, cek, false), encryptedKey: await aesWrap(kek, cek), epk };
  }
  const cek = crypto.getRandomValues(new Uint8Array(keyBytes));
  if (isGcmKeyWrapAlgorithm(alg)) {
    const { encryptedKey, iv, tag } = await gcmWrap(entry.cryptoKey as CryptoKey, cek);
    return {
      contentKey: await importContentKey(enc, cek, false),
      encryptedKey,
      gcm: { iv: encodeBase64Url(iv), tag: encodeBase64Url(tag) },
    };
  }
  const encryptedKey = isRsaAlgorithm(alg)
    ? new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, entry.cryptoKey as CryptoKey, cek))
    : await aesWrap(entry.cryptoKey as CryptoKey, cek);
  return { contentKey: await importContentKey(enc, cek, false), encryptedKey };
}

/** The content key a recipient recovers, or the issue that ends decryption before the content is touched. */
export type RecoveredKey = { readonly contentKey: ContentKey } | { readonly issue: JwtIssue };

export const DECRYPTION_FAILED: JwtIssue = Object.freeze({ code: "decryption_failed" });
const MALFORMED_EPK: JwtIssue = Object.freeze({ code: "malformed", path: Object.freeze(["header", "epk"]) });

/**
 * Recovers the content key of a token (RFC 7516 §5.2 steps 9–10).
 *
 * When unwrapping or RSA decryption fails, a random content key of the right length stands in (RFC 7516 §11.5),
 * so the token fails on its tag with the same `decryption_failed` a wrong tag gives: an attacker learns nothing
 * from which of the two failed, and RSA-OAEP's own padding check is never a separate answer. A wrong-length
 * encrypted key is public, so it fails at once with that same code.
 *
 * @param entry - The material of a decryption key bound to `header.alg`, and for `dir` to `header.enc`.
 */
export async function unwrapContentKey(
  header: JweHeader,
  entry: JweKeyEntry,
  encryptedKey: Uint8Array<ArrayBuffer>,
): Promise<RecoveredKey> {
  const { alg, enc } = header;
  if (alg === "dir") {
    return { contentKey: entry.contentKey as ContentKey };
  }
  const keyBytes = CONTENT_PARAMS[enc].keyBytes;
  let kek = entry.cryptoKey as CryptoKey;
  if (isEcdhAlgorithm(alg)) {
    const derived = await deriveFromHeader(alg, header, entry);
    if ("issue" in derived) {
      return derived;
    }
    if (alg === "ECDH-ES") {
      return { contentKey: await importContentKey(enc, derived.bytes, false) };
    }
    kek = await crypto.subtle.importKey("raw", derived.bytes, "AES-KW", false, ["unwrapKey"]);
  }
  let cek: Uint8Array<ArrayBuffer> | undefined;
  if (isRsaAlgorithm(alg)) {
    if (encryptedKey.length !== entry.modulusBytes) {
      return { issue: DECRYPTION_FAILED };
    }
    cek = await rsaDecrypt(kek, encryptedKey);
  } else if (isGcmKeyWrapAlgorithm(alg)) {
    // GCM does not lengthen what it encrypts. The header checks already fixed `iv` and `tag` to their lengths.
    if (encryptedKey.length !== keyBytes) {
      return { issue: DECRYPTION_FAILED };
    }
    cek = await gcmUnwrap(
      kek,
      encryptedKey,
      decodeBase64Url(header.iv as string) as Uint8Array<ArrayBuffer>,
      decodeBase64Url(header.tag as string) as Uint8Array<ArrayBuffer>,
    );
  } else {
    if (encryptedKey.length !== keyBytes + 8) {
      return { issue: DECRYPTION_FAILED };
    }
    cek = await aesUnwrap(kek, encryptedKey);
  }
  if (cek === undefined || cek.length !== keyBytes) {
    cek = crypto.getRandomValues(new Uint8Array(keyBytes));
  }
  return { contentKey: await importContentKey(enc, cek, false) };
}

async function aesWrap(kek: CryptoKey, cek: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const container = await crypto.subtle.importKey("raw", cek, RAW_KEY_CONTAINER, true, ["sign"]);
  return new Uint8Array(await crypto.subtle.wrapKey("raw", container, kek, "AES-KW"));
}

async function aesUnwrap(
  kek: CryptoKey,
  wrapped: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  try {
    const container = await crypto.subtle.unwrapKey("raw", wrapped, kek, "AES-KW", RAW_KEY_CONTAINER, true, ["sign"]);
    return new Uint8Array(await crypto.subtle.exportKey("raw", container));
  } catch {
    // An integrity check failure: answered with a random key, like a wrong tag.
    return undefined;
  }
}

/** RFC 7518 §4.7: AES-GCM over the content key, with a fresh 96-bit IV, no additional data and a 128-bit tag. */
async function gcmWrap(
  kek: CryptoKey,
  cek: Uint8Array<ArrayBuffer>,
): Promise<{
  readonly encryptedKey: Uint8Array<ArrayBuffer>;
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly tag: Uint8Array<ArrayBuffer>;
}> {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_KEY_WRAP_IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: GCM_KEY_WRAP_TAG_BYTES * 8 }, kek, cek),
  );
  return { encryptedKey: sealed.slice(0, cek.length), iv, tag: sealed.slice(cek.length) };
}

async function gcmUnwrap(
  kek: CryptoKey,
  encryptedKey: Uint8Array<ArrayBuffer>,
  iv: Uint8Array<ArrayBuffer>,
  tag: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, tagLength: GCM_KEY_WRAP_TAG_BYTES * 8 },
        kek,
        concatBytes(encryptedKey, tag),
      ),
    );
  } catch {
    // A tag that does not verify: answered with a random key, like a wrong content tag.
    return undefined;
  }
}

async function rsaDecrypt(
  key: CryptoKey,
  encryptedKey: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, key, encryptedKey));
  } catch {
    // An OAEP padding failure: answered with a random key, like a wrong tag.
    return undefined;
  }
}

/** The `hash` an RSA key management algorithm imports its key with. */
export function oaepImportParams(alg: RsaKeyManagementAlgorithm): RsaHashedImportParams {
  return { name: "RSA-OAEP", hash: OAEP_HASH[alg] };
}

/** The members an `epk` header may hold besides the public key, which RFC 7518 §4.6.1.1 does not name. */
const EPK_MEMBERS = new Set(["kty", "crv", "x", "y"]);

/**
 * Imports the token's `epk` on the recipient key's curve, then agrees and derives. Every way the `epk` can be
 * wrong is `malformed` at `["header", "epk"]`: not an object, another key type or curve, a coordinate of the wrong
 * length, a private or unknown member, a point off the curve, a low-order X25519 point, or an all-zero shared
 * secret. Web Crypto's import is what rejects a point off the curve.
 */
async function deriveFromHeader(
  alg: EcdhKeyManagementAlgorithm,
  header: JweHeader,
  entry: JweKeyEntry,
): Promise<{ readonly bytes: Uint8Array<ArrayBuffer> } | { readonly issue: JwtIssue }> {
  const curve = entry.curve as JweCurve;
  const epk = await importEpk(header.epk, curve);
  if (epk === undefined) {
    return { issue: MALFORMED_EPK };
  }
  const apu = header.apu === undefined ? EMPTY : decodeBase64Url(header.apu);
  const apv = header.apv === undefined ? EMPTY : decodeBase64Url(header.apv);
  if (apu === undefined || apv === undefined) {
    // The header checks already refused a non-base64url `apu` or `apv`.
    return { issue: { code: "malformed", path: ["header", header.apu === undefined ? "apv" : "apu"] } };
  }
  try {
    return { bytes: await agreeAndDerive(alg, header.enc, curve, entry.cryptoKey as CryptoKey, epk, apu, apv) };
  } catch {
    // A low-order X25519 point makes deriveBits throw; its message may name the point.
    return { issue: MALFORMED_EPK };
  }
}

async function importEpk(epk: unknown, curve: JweCurve): Promise<CryptoKey | undefined> {
  if (typeof epk !== "object" || epk === null || Array.isArray(epk)) {
    return undefined;
  }
  const members = epk as Record<string, unknown>;
  const params = CURVE_PARAMS[curve];
  if (Object.keys(members).some((name) => !EPK_MEMBERS.has(name))) {
    return undefined;
  }
  const coordinates = params.kty === "EC" ? ["x", "y"] : ["x"];
  if (members.kty !== params.kty || members.crv !== curve || (params.kty === "OKP" && "y" in members)) {
    return undefined;
  }
  const jwk: JsonWebKey = { kty: params.kty, crv: curve };
  for (const name of coordinates) {
    const value = members[name];
    const bytes = typeof value === "string" ? decodeBase64Url(value) : undefined;
    if (bytes === undefined || bytes.length !== params.coordinateBytes) {
      return undefined;
    }
    (jwk as Record<string, unknown>)[name] = value;
    // RFC 7748 §5 has X25519 mask the top bit of u; Node 26 does, and Web Crypto does not require every engine to.
    // No sender's runtime sets it, so it is refused here, the same way on every runtime.
    if (curve === "X25519" && ((bytes[bytes.length - 1] as number) & 0x80) !== 0) {
      return undefined;
    }
  }
  try {
    return await crypto.subtle.importKey("jwk", jwk, params.importParams, true, []);
  } catch {
    // A point off the curve; Web Crypto's message may quote it.
    return undefined;
  }
}

/**
 * Agrees on Z with `publicKey` and derives the key with the Concat KDF (RFC 7518 §4.6.2): the content key itself
 * for `ECDH-ES`, named by `enc`, or the key-encryption key for the `+A*KW` algorithms, named by `alg`.
 *
 * @throws When Web Crypto refuses the agreement, or Z is all zeros, as a low-order point gives where Web Crypto
 * does not refuse it.
 */
async function agreeAndDerive(
  alg: EcdhKeyManagementAlgorithm,
  enc: ContentEncryptionAlgorithm,
  curve: JweCurve,
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  apu: Uint8Array,
  apv: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const params = CURVE_PARAMS[curve];
  const z = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: params.importParams.name, public: publicKey } as EcdhKeyDeriveParams,
      privateKey,
      params.coordinateBytes * 8,
    ),
  );
  if (z.every((byte) => byte === 0)) {
    throw new Error("All-zero shared secret.");
  }
  const direct = alg === "ECDH-ES";
  const keyBytes = direct ? CONTENT_PARAMS[enc].keyBytes : KEY_WRAP_BYTES[alg];
  return concatKdf(z, keyBytes, direct ? enc : alg, apu, apv);
}

/** NIST SP 800-56A Concat KDF with SHA-256, as RFC 7518 §4.6.2 profiles it. */
export async function concatKdf(
  z: Uint8Array,
  keyBytes: number,
  algorithmId: string,
  apu: Uint8Array,
  apv: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const otherInfo = concatBytes(
    lengthPrefixed(encodeUtf8(algorithmId)),
    lengthPrefixed(apu),
    lengthPrefixed(apv),
    uint32(keyBytes * 8),
  );
  const rounds = Math.ceil(keyBytes / 32);
  const blocks = await Promise.all(
    Array.from(
      { length: rounds },
      async (_, index) =>
        new Uint8Array(await crypto.subtle.digest("SHA-256", concatBytes(uint32(index + 1), z, otherInfo))),
    ),
  );
  return concatBytes(...blocks).slice(0, keyBytes);
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function lengthPrefixed(bytes: Uint8Array): Uint8Array {
  return concatBytes(uint32(bytes.length), bytes);
}

/** The public members of an ephemeral key, in RFC 7638 order, as the `epk` header carries them. */
async function ephemeralPublicJwk(publicKey: CryptoKey, curve: JweCurve): Promise<Readonly<Record<string, string>>> {
  const exported = await crypto.subtle.exportKey("jwk", publicKey);
  const { kty } = CURVE_PARAMS[curve];
  const x = exported.x as string;
  return kty === "EC" ? { kty, crv: curve, x, y: exported.y as string } : { kty, crv: curve, x };
}
