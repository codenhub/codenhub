import type { AsymmetricAlgorithm, Jwk, PrivateKey, PublicKey } from "../core/types";
import { encodeBase64Url, encodeUtf8 } from "../encoding";
import { jweKeyThumbprint } from "../jwe/keys";
import { isJweKey } from "../jwe/registry";
import type { JwePrivateKey, JwePublicKey } from "../jwe/types";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportWebCryptoJwk } from "./exported-jwk";
import { getKeyEntry } from "./registry";

/** RFC 7638 §3.2: the required members of each key type, in lexicographic order. */
const THUMBPRINT_MEMBERS: Readonly<
  Record<Exclude<Jwk["kty"], "oct">, readonly ("crv" | "e" | "kty" | "n" | "x" | "y")[]>
> = {
  EC: ["crv", "kty", "x", "y"],
  OKP: ["crv", "kty", "x"],
  RSA: ["e", "kty", "n"],
};

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
 * @param key - A public or private key created by this package, for signing or for encryption (JWE).
 * @returns The 43-character thumbprint.
 * @throws TypeError when `key` is not a public or private key created by this package.
 */
export async function jwkThumbprint(key: PublicKey | PrivateKey | JwePublicKey | JwePrivateKey): Promise<string> {
  if (isJweKey(key)) {
    return jweKeyThumbprint(key as JwePublicKey | JwePrivateKey);
  }
  const entry = getKeyEntry(key);
  const publicCryptoKey = key.kind === "private" ? entry.publicCryptoKey : entry.cryptoKey;
  if ((key.kind !== "public" && key.kind !== "private") || publicCryptoKey === undefined) {
    throw new TypeError("jwkThumbprint: key must be a public or private key created by this package.");
  }
  return cryptoKeyThumbprint(publicCryptoKey, key.alg);
}

/** The RFC 7638 thumbprint of a public `CryptoKey` bound to `alg`. */
export async function cryptoKeyThumbprint(publicCryptoKey: CryptoKey, alg: AsymmetricAlgorithm): Promise<string> {
  const exported = await exportWebCryptoJwk(publicCryptoKey, alg);
  const kty = ALGORITHM_PARAMS[alg].kty as keyof typeof THUMBPRINT_MEMBERS;
  const material: Record<string, unknown> = { ...exported, kty };
  // Every required member is a base64url string or a fixed name, so JSON.stringify writes the RFC 7638 form:
  // no whitespace, and no escapes to normalize.
  const canonical = JSON.stringify(Object.fromEntries(THUMBPRINT_MEMBERS[kty].map((name) => [name, material[name]])));
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encodeUtf8(canonical))));
}
