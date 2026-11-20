import type { Jwk, PrivateJwk, PrivateKey, PublicJwk, PublicKey, SecretJwk, SecretKey } from "../core/types";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportWebCryptoJwk } from "./exported-jwk";
import { writePem } from "./pem";
import { getKeyEntryOfKind, isRegisteredKey } from "./registry";

type MaterialMember = "crv" | "x" | "y" | "n" | "e" | "d" | "p" | "q" | "dp" | "dq" | "qi" | "k";

const PUBLIC_MEMBERS: Readonly<Record<Jwk["kty"], readonly MaterialMember[]>> = {
  EC: ["crv", "x", "y"],
  OKP: ["crv", "x"],
  RSA: ["n", "e"],
  oct: [],
};

const PRIVATE_MEMBERS: Readonly<Record<Jwk["kty"], readonly MaterialMember[]>> = {
  EC: ["crv", "x", "y", "d"],
  OKP: ["crv", "x", "d"],
  RSA: ["n", "e", "d", "p", "q", "dp", "dq", "qi"],
  oct: ["k"],
};

/**
 * Exports a public key as a JWK, for publishing in a JWKS.
 *
 * @param key - A public key from {@link importPublicKey} or {@link generateKeyPair}.
 * @returns A frozen JWK with `kty`, `alg`, `use: "sig"`, `kid` when the key has one, and the public
 * members only, in a stable order. It never carries `ext` or `key_ops`.
 * @throws TypeError when `key` is not a public key created by this package. For a private key, the message
 * points to {@link getPublicKey}.
 */
export async function exportPublicJwk(key: PublicKey): Promise<PublicJwk> {
  const entry = publicEntry(key, "exportPublicJwk");
  return toJwk(key, await exportWebCryptoJwk(entry.cryptoKey, key.alg), PUBLIC_MEMBERS) as PublicJwk;
}

/**
 * Exports a private key's material as a JWK. Handle the result as a secret.
 *
 * @param key - A private key imported or generated with `extractable: true`.
 * @returns A frozen JWK with `kty`, `alg`, `use: "sig"`, `kid` when the key has one, and the public and
 * private members, in a stable order. It never carries `ext` or `key_ops`.
 * @throws TypeError when `key` is not a private key created by this package, or was created without
 * `extractable: true`.
 */
export async function exportPrivateJwk(key: PrivateKey): Promise<PrivateJwk> {
  const entry = extractablePrivateEntry(key, "exportPrivateJwk");
  return toJwk(key, await exportWebCryptoJwk(entry.cryptoKey, key.alg), PRIVATE_MEMBERS) as PrivateJwk;
}

/**
 * Exports an HMAC secret as an `oct` JWK. Handle the result as a secret.
 *
 * @param key - A secret key imported or generated with `extractable: true`.
 * @returns A frozen JWK with `kty: "oct"`, `alg`, `use: "sig"`, `kid` when the key has one, and `k`. It
 * never carries `ext` or `key_ops`.
 * @throws TypeError when `key` is not a secret key created by this package, or was created without
 * `extractable: true`.
 */
export async function exportSecretJwk(key: SecretKey): Promise<SecretJwk> {
  const entry = getKeyEntryOfKind(key, "secret");
  if (!key.extractable) {
    throw new TypeError("exportSecretJwk: the key was not created with extractable: true.");
  }
  return toJwk(key, await exportWebCryptoJwk(entry.cryptoKey, key.alg), PRIVATE_MEMBERS) as SecretJwk;
}

/**
 * Exports a public key as a PEM `PUBLIC KEY` block (SPKI, RFC 7468 §13), for tools and services that take PEM
 * rather than a JWK, such as OpenSSL or a cloud console.
 *
 * @example
 * ```ts
 * const pem = await exportPublicPem(getPublicKey(privateKey));
 * ```
 *
 * @param key - A public key from {@link importPublicKey} or {@link generateKeyPair}.
 * @returns The PEM text: the base64 in 64-character lines, with `
` line endings and a final line break.
 * @throws TypeError when `key` is not a public key created by this package. For a private key, the message
 * points to {@link getPublicKey}.
 */
export async function exportPublicPem(key: PublicKey): Promise<string> {
  const entry = publicEntry(key, "exportPublicPem");
  return writePem("PUBLIC KEY", new Uint8Array(await crypto.subtle.exportKey("spki", entry.cryptoKey)));
}

/**
 * Exports a private key as a PEM `PRIVATE KEY` block (PKCS#8, RFC 7468 §10), unencrypted. Handle the result as a
 * secret.
 *
 * @param key - A private key imported or generated with `extractable: true`.
 * @returns The PEM text: the base64 in 64-character lines, with `
` line endings and a final line break.
 * @throws TypeError when `key` is not a private key created by this package, was created without
 * `extractable: true`, or is held by an external signer.
 */
export async function exportPrivatePem(key: PrivateKey): Promise<string> {
  const entry = extractablePrivateEntry(key, "exportPrivatePem");
  return writePem("PRIVATE KEY", new Uint8Array(await crypto.subtle.exportKey("pkcs8", entry.cryptoKey)));
}

/** The entry of a public key, with a message that points a private key to `getPublicKey`. */
function publicEntry(key: PublicKey, functionName: string) {
  if (isRegisteredKey(key) && (key as { readonly kind: string }).kind === "private") {
    throw new TypeError(`${functionName}: key is a private key; export its public half with getPublicKey(key).`);
  }
  return getKeyEntryOfKind(key, "public");
}

/** The entry of a private key whose material may be exported. */
function extractablePrivateEntry(key: PrivateKey, functionName: string) {
  const entry = getKeyEntryOfKind(key, "private");
  if (entry.externalSign !== undefined) {
    throw new TypeError(`${functionName}: the key's material is held by an external signer.`);
  }
  if (!key.extractable) {
    throw new TypeError(`${functionName}: the key was not created with extractable: true.`);
  }
  return entry;
}

function toJwk(
  key: PublicKey | PrivateKey | SecretKey,
  exported: JsonWebKey,
  membersByType: Readonly<Record<Jwk["kty"], readonly MaterialMember[]>>,
): Jwk {
  const kty = ALGORITHM_PARAMS[key.alg].kty;
  const jwk: Record<string, string> = { kty, alg: key.alg, use: "sig" };
  if (key.kid !== undefined) {
    jwk.kid = key.kid;
  }
  for (const member of membersByType[kty]) {
    const value = exported[member];
    if (typeof value === "string") {
      jwk[member] = value;
    }
  }
  return Object.freeze(jwk) as unknown as Jwk;
}
