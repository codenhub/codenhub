import type { PrivateKey, PublicKey, SecretKey } from "../core/types";

/** Any key object this package creates. */
export type AnyKey = PublicKey | PrivateKey | SecretKey;

/** What the package holds for a key object, out of reach of the caller. */
export interface KeyEntry {
  /** The Web Crypto key the object stands for. */
  readonly cryptoKey: CryptoKey;
  /**
   * Exact byte length a JWS signature made with this key has: 64 for ES256, EdDSA and Ed25519, the
   * modulus byte length for RS256 and PS256, and 32 for HS256.
   */
  readonly signatureLength: number;
}

const registry = new WeakMap<object, KeyEntry>();

/** Freezes a key object and records its material. The object must be freshly built by this module. */
export function registerKey<TKey extends AnyKey>(key: TKey, entry: KeyEntry): TKey {
  const frozen = Object.freeze(key);
  registry.set(frozen, Object.freeze({ ...entry }));
  return frozen;
}

/** Whether `value` is a key object this package created. Never throws. */
export function isRegisteredKey(value: unknown): value is AnyKey {
  return typeof value === "object" && value !== null && registry.has(value);
}

/**
 * Returns the material behind a key object.
 *
 * @throws TypeError when `key` is not a key object this package created, such as a look-alike copy.
 */
export function getKeyEntry(key: unknown): KeyEntry {
  const entry = typeof key === "object" && key !== null ? registry.get(key) : undefined;
  if (entry === undefined) {
    throw new TypeError("Expected a key created by @codenhub/jwt (import*, generate*), not a look-alike object.");
  }
  return entry;
}

/**
 * Returns the material behind a key object of the given kind.
 *
 * @throws TypeError when `key` is not a key object this package created, or is of another kind.
 */
export function getKeyEntryOfKind(key: unknown, kind: AnyKey["kind"]): KeyEntry {
  const entry = getKeyEntry(key);
  if ((key as AnyKey).kind !== kind) {
    throw new TypeError(`Expected a ${kind} key.`);
  }
  return entry;
}

/** Spreads a `kid` member only when there is one, so key objects have no `kid: undefined`. */
export function kidMember(kid: string | undefined): { readonly kid?: string } {
  return kid === undefined ? {} : { kid };
}
