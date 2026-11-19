import type { Jwk, PublicKey } from "../core/types";
import { encodeBase64Url, encodeUtf8 } from "../encoding";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportWebCryptoJwk } from "./exported-jwk";
import { getKeyEntryOfKind } from "./registry";

/** RFC 7638 §3.2: the required members of each key type, in lexicographic order. */
const THUMBPRINT_MEMBERS: Readonly<
  Record<Exclude<Jwk["kty"], "oct">, readonly ("crv" | "e" | "kty" | "n" | "x" | "y")[]>
> = {
  EC: ["crv", "kty", "x", "y"],
  OKP: ["crv", "kty", "x"],
  RSA: ["e", "kty", "n"],
};

/**
 * Computes a public key's JWK SHA-256 Thumbprint (RFC 7638), base64url-encoded without padding.
 *
 * @remarks
 * The thumbprint names the key by its material alone: `alg`, `kid` and `use` do not change it, so the same
 * key imported for two algorithms has one thumbprint. It is what DPoP binds a token to (RFC 9449 §6.1, the
 * `jkt` of a `cnf` claim), and it makes a stable `kid`.
 *
 * @example
 * ```ts
 * const { publicKey } = await generateKeyPair({ alg: "ES256" });
 * const jkt = await jwkThumbprint(publicKey); // 43 base64url characters
 * ```
 *
 * @param key - A public key from {@link importPublicKey}, {@link importKeyPair} or {@link generateKeyPair}.
 * @returns The 43-character thumbprint.
 * @throws TypeError when `key` is not a public key created by this package.
 */
export async function jwkThumbprint(key: PublicKey): Promise<string> {
  const entry = getKeyEntryOfKind(key, "public");
  const exported = await exportWebCryptoJwk(entry.cryptoKey, key.alg);
  const kty = ALGORITHM_PARAMS[key.alg].kty as keyof typeof THUMBPRINT_MEMBERS;
  const material: Record<string, unknown> = { ...exported, kty };
  // Every required member is a base64url string or a fixed name, so JSON.stringify writes the RFC 7638 form:
  // no whitespace, and no escapes to normalize.
  const canonical = JSON.stringify(Object.fromEntries(THUMBPRINT_MEMBERS[kty].map((name) => [name, material[name]])));
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encodeUtf8(canonical))));
}
