import { isJwsAlgorithm } from "../core/limits";
import type { JwsAlgorithm } from "../core/types";
import { encodeBase64Url } from "../encoding";

type Digest = "SHA-256" | "SHA-384" | "SHA-512";

const DIGESTS: Readonly<Record<JwsAlgorithm, Digest>> = Object.freeze({
  ES256: "SHA-256",
  ES384: "SHA-384",
  ES512: "SHA-512",
  // OpenID Connect Core 1.0 errata set 2, §3.1.3.6: Ed25519 hashes with SHA-512.
  EdDSA: "SHA-512",
  Ed25519: "SHA-512",
  RS256: "SHA-256",
  RS384: "SHA-384",
  RS512: "SHA-512",
  PS256: "SHA-256",
  PS384: "SHA-384",
  PS512: "SHA-512",
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
});

const encoder = new TextEncoder();

/**
 * Computes an OpenID Connect token hash, such as `at_hash` for an access token or `c_hash` for an
 * authorization code (OpenID Connect Core §3.1.3.6 and §3.3.2.11): the left half of the digest that the
 * ID token's `alg` uses, base64url-encoded. `EdDSA` and `Ed25519` use SHA-512.
 *
 * @example
 * ```ts
 * const idToken = await sign({ payload: { ...claims, at_hash: await tokenHash(accessToken, "ES256") }, key });
 * ```
 *
 * @param value - The token or code, hashed as its UTF-8 bytes.
 * @param alg - The `alg` of the ID token that will carry the hash.
 * @returns The hash, 22, 32 or 43 base64url characters for SHA-256, SHA-384 and SHA-512.
 * @throws TypeError when `value` is not a string or `alg` is not a supported JWS algorithm.
 */
export async function tokenHash(value: string, alg: JwsAlgorithm): Promise<string> {
  if (typeof value !== "string") {
    throw new TypeError("tokenHash: value must be a string.");
  }
  if (!isJwsAlgorithm(alg)) {
    throw new TypeError("tokenHash: alg must be a supported JWS algorithm.");
  }
  const digest = new Uint8Array(await crypto.subtle.digest(DIGESTS[alg], encoder.encode(value)));
  return encodeBase64Url(digest.subarray(0, digest.length / 2));
}
