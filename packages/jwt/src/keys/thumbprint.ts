import type { AsymmetricAlgorithm, Jwk, PrivateKey, PublicKey, SecretKey } from "../core/types";
import { encodeBase64Url, encodeUtf8 } from "../encoding";
import { jweKeyThumbprint } from "../jwe/keys";
import { isJweKey } from "../jwe/registry";
import type { JwePrivateKey, JwePublicKey } from "../jwe/types";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportWebCryptoJwk } from "./exported-jwk";
import { isSingleSequence, readPemBlock } from "./pem";
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

/** RFC 9278 §3: the URI prefix of a SHA-256 JWK thumbprint. */
const THUMBPRINT_URI_PREFIX = "urn:ietf:params:oauth:jwk-thumbprint:sha-256:";

/**
 * Computes a key's JWK SHA-256 Thumbprint (RFC 7638), base64url-encoded without padding: a key pair's from its
 * public key or its private key, or a secret's from its `oct` material.
 *
 * @remarks
 * The thumbprint names the key by its material alone: `alg`, `kid` and `use` do not change it, so the same
 * key imported for two algorithms has one thumbprint. It is what DPoP binds a token to (RFC 9449 §6.1, the
 * `jkt` of a `cnf` claim), and it makes a stable `kid`. A private key gives the thumbprint of its public
 * half, also when it is not extractable. A secret's thumbprint is computed from the secret itself, so the
 * secret must be extractable; a thumbprint reveals nothing of a secret with enough entropy, which every
 * secret this package accepts has.
 *
 * @example
 * ```ts
 * const { publicKey } = await generateKeyPair({ alg: "ES256" });
 * const jkt = await jwkThumbprint(publicKey); // 43 base64url characters
 * ```
 *
 * @param key - A public, private or secret key created by this package; a public or private one may be for encryption (JWE).
 * @returns The 43-character thumbprint.
 * @throws TypeError when `key` is not a key created by this package, or is a secret created without
 * `extractable: true`.
 */
export async function jwkThumbprint(
  key: PublicKey | PrivateKey | SecretKey | JwePublicKey | JwePrivateKey,
): Promise<string> {
  if (isJweKey(key)) {
    return jweKeyThumbprint(key as JwePublicKey | JwePrivateKey);
  }
  const entry = getKeyEntry(key);
  if (key.kind === "secret") {
    if (!key.extractable) {
      throw new TypeError(
        "jwkThumbprint: a secret key's thumbprint reads its material; create it with extractable: true.",
      );
    }
    return materialThumbprint(await crypto.subtle.exportKey("jwk", entry.cryptoKey), "oct");
  }
  const publicCryptoKey = key.kind === "private" ? entry.publicCryptoKey : entry.cryptoKey;
  if ((key.kind !== "public" && key.kind !== "private") || publicCryptoKey === undefined) {
    throw new TypeError("jwkThumbprint: key must be a public, private or secret key created by this package.");
  }
  return cryptoKeyThumbprint(publicCryptoKey, key.alg);
}

/**
 * Computes a key's JWK Thumbprint URI (RFC 9278): `urn:ietf:params:oauth:jwk-thumbprint:sha-256:` followed by
 * its {@link jwkThumbprint}, for a protocol that names a key by URI, such as the `sub` of a self-issued ID token.
 *
 * @example
 * ```ts
 * const uri = await jwkThumbprintUri(publicKey);
 * // "urn:ietf:params:oauth:jwk-thumbprint:sha-256:NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"
 * ```
 *
 * @param key - A public, private or secret key created by this package.
 * @returns The URI.
 * @throws TypeError as {@link jwkThumbprint} does.
 */
export async function jwkThumbprintUri(key: PublicKey | PrivateKey | SecretKey): Promise<string> {
  return `${THUMBPRINT_URI_PREFIX}${await jwkThumbprint(key)}`;
}

/**
 * Computes an X.509 certificate's SHA-256 thumbprint, base64url-encoded without padding: the `x5t#S256` of a
 * JOSE header (RFC 7515 §4.1.8) or the `cnf` of a certificate-bound access token (RFC 8705 §3.1).
 *
 * @remarks
 * It hashes the certificate's DER as given and does not parse or validate the certificate further: whether it
 * is current, or whom it names, is up to its issuer's chain, which this package does not check.
 *
 * @example
 * ```ts
 * const x5tS256 = await certificateThumbprint(clientCertificatePem);
 * ```
 *
 * @param pem - One `CERTIFICATE` PEM block, with LF or CRLF line breaks, or with `\n` escapes as in an
 * environment variable.
 * @returns The 43-character thumbprint.
 * @throws TypeError when `pem` is not a single `CERTIFICATE` block holding one DER `SEQUENCE`.
 */
export async function certificateThumbprint(pem: string): Promise<string> {
  const block = typeof pem === "string" ? readPemBlock(pem) : undefined;
  if (block?.label !== "CERTIFICATE" || block.hasHeaders || block.der === undefined || !isSingleSequence(block.der)) {
    throw new TypeError("certificateThumbprint: pem must be a single CERTIFICATE PEM block.");
  }
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", block.der)));
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
