import { markEncryptionKey } from "../keys/registry";
import type { ContentKey } from "./content";
import type { JweCurve, JweDecryptionKey, JweEncryptionKey, JwePrivateKey, JwePublicKey, JweSecretKey } from "./types";

/** Any JWE key object this package creates. */
export type AnyJweKey = JwePublicKey | JwePrivateKey | JweSecretKey;

/**
 * What the package holds for a JWE key object, out of reach of the caller. JWE keys live in a registry of their
 * own, apart from the JWS one, so a JWE key passed to a JWS function, or a JWS key to a JWE one, is never a key
 * there: every function of the other family throws `TypeError` for it, with no check to forget.
 */
export interface JweKeyEntry {
  /**
   * The Web Crypto key: RSA-OAEP for `encrypt` or `decrypt`, ECDH or X25519 (a private one derives bits), or
   * AES-KW for `wrapKey` and `unwrapKey`. Absent for a `dir` key, which holds `contentKey` instead.
   */
  readonly cryptoKey?: CryptoKey;
  /** For a private key, its public half, proven to match. */
  readonly publicCryptoKey?: CryptoKey;
  /** For an RSA key, the modulus length in bytes, which is also the encrypted key's exact length. */
  readonly modulusBytes?: number;
  /** For an `ECDH-ES` key, its curve. */
  readonly curve?: JweCurve;
  /** For a `dir` key, the content key it is. */
  readonly contentKey?: ContentKey;
}

const registry = new WeakMap<object, JweKeyEntry>();

/** Freezes a key object and records its material. The object must be freshly built by this module. */
export function registerJweKey<TKey extends AnyJweKey>(key: TKey, entry: JweKeyEntry): TKey {
  const frozen = Object.freeze(key);
  registry.set(frozen, Object.freeze({ ...entry }));
  markEncryptionKey(
    frozen,
    key.kind === "jwe-private" ? entry.publicCryptoKey : key.kind === "jwe-public" ? entry.cryptoKey : undefined,
  );
  return frozen;
}

/** Whether `value` is a JWE key object this package created. Never throws. */
export function isJweKey(value: unknown): value is AnyJweKey {
  return typeof value === "object" && value !== null && registry.has(value);
}

/** Whether `value` is a JWE key this package created that can encrypt. Never throws. */
export function isJweEncryptionKey(value: unknown): value is JweEncryptionKey {
  return isJweKey(value) && value.kind !== "jwe-private";
}

/** Whether `value` is a JWE key this package created that can decrypt. Never throws. */
export function isJweDecryptionKey(value: unknown): value is JweDecryptionKey {
  return isJweKey(value) && value.kind !== "jwe-public";
}

/**
 * Returns the material behind a JWE key object.
 *
 * @throws TypeError when `key` is not a JWE key object this package created, such as a JWS key or a look-alike.
 */
export function getJweKeyEntry(key: unknown, functionName: string): JweKeyEntry {
  const entry = typeof key === "object" && key !== null ? registry.get(key) : undefined;
  if (entry === undefined) {
    throw new TypeError(
      `${functionName}: expected a JWE key created by @codenhub/jwt (importJwe*, generateJwe*), not a JWS key or a look-alike object.`,
    );
  }
  return entry;
}
