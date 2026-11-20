import type { Jwk, PrivateJwk, PrivateKey, PublicJwk, PublicKey, SecretJwk, SecretKey } from "../core/types";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportWebCryptoJwk } from "./exported-jwk";
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
  if (isRegisteredKey(key) && (key as { readonly kind: string }).kind === "private") {
    throw new TypeError("exportPublicJwk: key is a private key; export its public half with getPublicKey(key).");
  }
  const entry = getKeyEntryOfKind(key, "public");
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
  const entry = getKeyEntryOfKind(key, "private");
  if (entry.externalSign !== undefined) {
    throw new TypeError("exportPrivateJwk: the key's material is held by an external signer.");
  }
  if (!key.extractable) {
    throw new TypeError("exportPrivateJwk: the key was not created with extractable: true.");
  }
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
