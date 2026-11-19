import type { JwsAlgorithm } from "../core/types";
import { decodeBase64Url, encodeBase64Url } from "../encoding";
import { ALGORITHM_PARAMS } from "./algorithms";

/**
 * Exports a key from Web Crypto as a JWK, with the private scalar `d` of an `EC` or `OKP` key at its full
 * length. RFC 7518 §6.2.2.1 requires `d` to be as long as the curve's coordinates, and the JWK checks
 * refuse it otherwise, but WebKit drops its leading zero bytes on export: Playwright 1.61.1's WebKit on
 * Windows gave a 65-byte P-521 `d` for 98 of 200 keys, and a short P-256 `d` for 21 of 4000. Without the
 * padding, such a key exported by `exportPrivateJwk` or read from PEM would not import again.
 *
 * @param cryptoKey - The key to export; it must be extractable.
 * @param alg - The algorithm the key is bound to, which fixes the length of `d`.
 * @returns The JWK as Web Crypto exported it, with `d` padded when it was short.
 */
export async function exportWebCryptoJwk(cryptoKey: CryptoKey, alg: JwsAlgorithm): Promise<JsonWebKey> {
  const exported = await crypto.subtle.exportKey("jwk", cryptoKey);
  const { coordinateBytes } = ALGORITHM_PARAMS[alg];
  const scalar = typeof exported.d === "string" ? decodeBase64Url(exported.d) : undefined;
  if (coordinateBytes === undefined || scalar === undefined || scalar.length >= coordinateBytes) {
    return exported;
  }
  const padded = new Uint8Array(coordinateBytes);
  padded.set(scalar, coordinateBytes - scalar.length);
  return { ...exported, d: encodeBase64Url(padded) };
}
