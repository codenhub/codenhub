import type { AsymmetricAlgorithm, Jwk, PrivateKey, PublicKey } from "../core/types";
import { encodeBase64Url, encodeUtf8 } from "../encoding";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportWebCryptoJwk } from "./exported-jwk";
import { getKeyEntry } from "./registry";

/** RFC 7638 §3.2: the required members of each key type, in lexicographic order. */
const THUMBPRINT_MEMBERS: Readonly<Record<Jwk["kty"], readonly ("crv" | "e" | "k" | "kty" | "n" | "x" | "y")[]>> = {
  EC: ["crv", "kty", "x", "y"],
  OKP: ["crv", "kty", "x"],
  RSA: ["e", "kty", "n"],
  oct: ["k", "kty"],
};

/** The `kid` option value that names a generated or imported key by its RFC 7638 thumbprint. */
export const THUMBPRINT_KID = "thumbprint";

/**
 * Computes a key pair's JWK SHA-256 Thumbprint (RFC 7638), base64url-encoded without padding, from its
 * public key or its private key.
 *
 * @remarks
 * The thumbprint names the key by its material alone: `alg`, `kid` and `use` do not change it, so the same
 * key imported for two algorithms has one thumbprint. It is what DPoP binds a token to (RFC 9449 §6.1, the
 * `jkt` of a `cnf` claim), and it makes a stable `kid`. A private key gives the thumbprint of its public
 * half, also when it is not extractable.
 *
 * @example
 * ```ts
 * const { publicKey } = await generateKeyPair({ alg: "ES256" });
 * const jkt = await jwkThumbprint(publicKey); // 43 base64url characters
 * ```
 *
 * @param key - A public or private key created by this package.
 * @returns The 43-character thumbprint.
 * @throws TypeError when `key` is not a public or private key created by this package.
 */
export async function jwkThumbprint(key: PublicKey | PrivateKey): Promise<string> {
  const entry = getKeyEntry(key);
  const publicCryptoKey = key.kind === "private" ? entry.publicCryptoKey : entry.cryptoKey;
  if ((key.kind !== "public" && key.kind !== "private") || publicCryptoKey === undefined) {
    throw new TypeError("jwkThumbprint: key must be a public or private key created by this package.");
  }
  return cryptoKeyThumbprint(publicCryptoKey, key.alg);
}

/** The RFC 7638 thumbprint of a public `CryptoKey` bound to `alg`. */
export async function cryptoKeyThumbprint(publicCryptoKey: CryptoKey, alg: AsymmetricAlgorithm): Promise<string> {
  return materialThumbprint(await exportWebCryptoJwk(publicCryptoKey, alg), ALGORITHM_PARAMS[alg].kty);
}

/**
 * The RFC 7638 thumbprint of a JWK's material, read from the members its `kty` requires (RFC 7638 §3.2), which
 * must be in canonical form already: an RSA `n` and `e` without leading zero bytes, as Web Crypto exports them
 * and the JWK checks give them.
 */
export async function materialThumbprint(jwk: JsonWebKey, kty: Jwk["kty"]): Promise<string> {
  const material: Record<string, unknown> = { ...jwk, kty };
  // Every required member is a base64url string or a fixed name, so JSON.stringify writes the RFC 7638 form:
  // no whitespace, and no escapes to normalize.
  const canonical = JSON.stringify(Object.fromEntries(THUMBPRINT_MEMBERS[kty].map((name) => [name, material[name]])));
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encodeUtf8(canonical))));
}
