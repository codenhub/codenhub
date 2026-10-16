import type { Jwk, PrivateKey, PublicKey, SecretKey } from "../core/types";
import { ALGORITHM_PARAMS } from "./algorithms";
import { getKeyEntryOfKind } from "./registry";

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
 * @throws TypeError when `key` is not a public key created by this package.
 */
export async function exportPublicJwk(key: PublicKey): Promise<Jwk> {
  const entry = getKeyEntryOfKind(key, "public");
  return toJwk(key, await crypto.subtle.exportKey("jwk", entry.cryptoKey), PUBLIC_MEMBERS);
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
export async function exportPrivateJwk(key: PrivateKey): Promise<Jwk> {
  const entry = getKeyEntryOfKind(key, "private");
  if (!key.extractable) {
    throw new TypeError("exportPrivateJwk: the key was not created with extractable: true.");
  }
  return toJwk(key, await crypto.subtle.exportKey("jwk", entry.cryptoKey), PRIVATE_MEMBERS);
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
export async function exportSecretJwk(key: SecretKey): Promise<Jwk> {
  const entry = getKeyEntryOfKind(key, "secret");
  if (!key.extractable) {
    throw new TypeError("exportSecretJwk: the key was not created with extractable: true.");
  }
  return toJwk(key, await crypto.subtle.exportKey("jwk", entry.cryptoKey), PRIVATE_MEMBERS);
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
