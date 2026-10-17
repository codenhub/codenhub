import { encodeBase64Url } from "./encoding";

const encoder = new TextEncoder();

/**
 * Computes the `at_hash` (OpenID Connect Core §3.1.3.6) for an access token, or `undefined` when the
 * algorithm has no defined hash.
 *
 * The hash is the left half of the digest selected by the ID token's `alg`, base64url-encoded.
 */
export async function computeTokenHash(token: string, alg: string): Promise<string | undefined> {
  const digestName = digestForAlgorithm(alg);
  if (digestName === undefined) {
    return undefined;
  }
  const digest = new Uint8Array(await crypto.subtle.digest(digestName, encoder.encode(token)));
  return encodeBase64Url(digest.subarray(0, digest.length / 2));
}

/**
 * Maps an ID token `alg` to its digest. A `switch` rather than an object lookup, so names such as
 * `constructor` cannot match an inherited property.
 */
const digestForAlgorithm = (alg: string): "SHA-256" | "SHA-512" | undefined => {
  switch (alg) {
    case "EdDSA":
    case "Ed25519":
      return "SHA-512";
    case "ES256":
    case "RS256":
    case "PS256":
    case "HS256":
      return "SHA-256";
    default:
      return undefined;
  }
};
