import type { PrivateKey, PublicKey, SecretKey } from "../core/types";

/** Any key object this package creates. */
export type AnyKey = PublicKey | PrivateKey | SecretKey;

/** What the package holds for a key object, out of reach of the caller. */
export interface KeyEntry {
  /** The Web Crypto key the object stands for. */
  readonly cryptoKey: CryptoKey;
  /**
   * Exact byte length a JWS signature made with this key has: the algorithm's `signatureBytes`, or the
   * modulus byte length for an RSA key.
   */
  readonly signatureLength: number;
  /** For a private key, the public half of its pair, proven to match, so its thumbprint never needs the private material. */
  readonly publicCryptoKey?: CryptoKey;
  /**
   * For a private key made by `createExternalSigningKey`, the function its signatures come from, already in
   * JWS form. `cryptoKey` is then the public key, which can only verify.
   */
  readonly externalSign?: (data: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>>;
}

const registry = new WeakMap<object, KeyEntry>();

/**
 * Every JWE key object, recorded by the JWE registry so a JWS function can say what it was given, with the
 * public `CryptoKey` of a public or private one for `jwkThumbprint`. It lives here, where JWE code already imports
 * from, so the JWS functions handle a JWE key without importing any JWE code.
 */
const encryptionKeys = new WeakMap<object, CryptoKey | undefined>();

/**
 * Records a frozen JWE key object, for the message {@link getKeyEntry} throws for one, and its public half for
 * {@link encryptionPublicCryptoKey}: `undefined` for a secret.
 */
export function markEncryptionKey(key: object, publicCryptoKey: CryptoKey | undefined): void {
  encryptionKeys.set(key, publicCryptoKey);
}

/** Whether `value` is a JWE key object this package created. Never throws. */
export function isEncryptionKey(value: unknown): boolean {
  return typeof value === "object" && value !== null && encryptionKeys.has(value);
}

/** The public `CryptoKey` of a JWE public or private key; `undefined` for a JWE secret or any other value. */
export function encryptionPublicCryptoKey(value: unknown): CryptoKey | undefined {
  return typeof value === "object" && value !== null ? encryptionKeys.get(value) : undefined;
}

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
 * @throws TypeError when `key` is not a key object this package created, such as a look-alike copy. For a JWE key,
 * the message says so and names the JWE functions.
 */
export function getKeyEntry(key: unknown): KeyEntry {
  const entry = typeof key === "object" && key !== null ? registry.get(key) : undefined;
  if (entry === undefined) {
    if (typeof key === "object" && key !== null && encryptionKeys.has(key)) {
      throw new TypeError(
        "Expected a signing (JWS) key, not an encryption (JWE) key; pass a JWE key to the JWE functions, such as encrypt, createJweKeySet, getJwePublicKey, exportJwePublicJwk and exportJwePrivateJwk.",
      );
    }
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

/**
 * Returns `key` bound to `issuer`: `key` itself when it already is, or else a new frozen copy with an
 * `issuer` member that shares its material.
 *
 * @throws TypeError when `key` is already bound to another issuer.
 */
export function bindIssuer<TKey extends PublicKey | SecretKey>(key: TKey, issuer: string, functionName: string): TKey {
  if (key.issuer === issuer) {
    return key;
  }
  if (key.issuer !== undefined) {
    throw new TypeError(`${functionName}: a key is already bound to another issuer.`);
  }
  return registerKey<TKey>({ ...key, issuer }, getKeyEntry(key));
}

/**
 * Reads the `issuer` option of a key set: undefined, or a non-empty string.
 *
 * @throws TypeError when it is neither.
 */
export function readIssuer(options: unknown, functionName: string): string | undefined {
  if (typeof options !== "object" || options === null) {
    return undefined;
  }
  const issuer: unknown = Reflect.get(options, "issuer");
  if (issuer !== undefined && (typeof issuer !== "string" || issuer.length === 0)) {
    throw new TypeError(`${functionName}: options.issuer must be a non-empty string.`);
  }
  return issuer;
}

/** Spreads a `kid` member only when there is one, so key objects have no `kid: undefined`. */
export function kidMember(kid: string | undefined): { readonly kid?: string } {
  return kid === undefined ? {} : { kid };
}
