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
  return padPrivateScalar(await crypto.subtle.exportKey("jwk", cryptoKey), ALGORITHM_PARAMS[alg].coordinateBytes);
}

/**
 * Pads an exported JWK's private scalar `d` with leading zero bytes to `coordinateBytes`, for the WebKit export
 * {@link exportWebCryptoJwk} records. Shared by the JWS and JWE keys, so it takes the length rather than an
 * algorithm.
 *
 * @param coordinateBytes - The curve's coordinate length, or undefined for a key without one, which is returned
 * as it is.
 */
export function padPrivateScalar(exported: JsonWebKey, coordinateBytes: number | undefined): JsonWebKey {
  const scalar = typeof exported.d === "string" ? decodeBase64Url(exported.d) : undefined;
  if (coordinateBytes === undefined || scalar === undefined || scalar.length >= coordinateBytes) {
    return exported;
  }
  const padded = new Uint8Array(coordinateBytes);
  padded.set(scalar, coordinateBytes - scalar.length);
  return { ...exported, d: encodeBase64Url(padded) };
}

/** The JWK members Web Crypto adds on export that say nothing about the material. */
const EXPORT_METADATA = ["alg", "ext", "key_ops", "use"] as const;

/** A copy of an exported JWK without the members Web Crypto adds on export. */
export function withoutExportMetadata(jwk: JsonWebKey): Record<string, unknown> {
  const material: Record<string, unknown> = { ...jwk };
  for (const name of EXPORT_METADATA) {
    delete material[name];
  }
  return material;
}

/**
 * Exports a key from Web Crypto as the JWK of its material alone, for the JWK checks to run on as on a JWK
 * given directly: without the members Web Crypto adds on export, and with `kid` when one is given.
 *
 * @param cryptoKey - The key to export; it must be extractable.
 * @param alg - The algorithm the key will be bound to, which fixes the length of `d`.
 * @param kid - The key identifier to add.
 */
export async function exportMaterialJwk(
  cryptoKey: CryptoKey,
  alg: JwsAlgorithm,
  kid: string | undefined,
): Promise<Record<string, unknown>> {
  const jwk = withoutExportMetadata(await exportWebCryptoJwk(cryptoKey, alg));
  return kid === undefined ? jwk : { ...jwk, kid };
}

/**
 * Whether `value` is a genuine Web Crypto key of this realm; never throws. `instanceof` alone also passes
 * `Object.create(CryptoKey.prototype)` or a proxy of a key, whose `type` getter then throws, so the native
 * getter is called on it as the brand check.
 */
export function isCryptoKey(value: unknown): value is CryptoKey {
  try {
    if (typeof CryptoKey !== "function" || !(value instanceof CryptoKey)) {
      return false;
    }
    Object.getOwnPropertyDescriptor(CryptoKey.prototype, "type")?.get?.call(value);
    return true;
  } catch {
    // A revoked proxy throws on the prototype lookup, and an impostor in the native getter; neither is a key.
    return false;
  }
}
