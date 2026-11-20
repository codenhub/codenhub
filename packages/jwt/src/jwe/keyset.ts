import type { JwtResult } from "../core/types";
import { ownDataValue } from "../keys/algorithms";
import { selectKey } from "../keysets/select";
import {
  ASYMMETRIC_KEY_MANAGEMENT_ALGORITHMS,
  CURVE_PARAMS,
  isAsymmetricKeyManagementAlgorithm,
  isJweCurve,
} from "./algorithms";
import { importJwePublicKey } from "./keys";
import type {
  AsymmetricKeyManagementAlgorithm,
  EncryptionKeyQuery,
  JwePublicKey,
  LocalEncryptionKeySet,
} from "./types";

/** How `importKeySet` and `createRemoteKeySet` read a JWKS of encryption keys. */
export interface EncryptionKeySetOptions {
  /** Selects encryption keys: only JWKs that say they encrypt are imported, as JWE public keys. */
  readonly use: "enc";
  /**
   * Key management algorithms keys may be bound to. A JWK naming another in its `alg` is skipped, and a JWK
   * without `alg` is bound to each listed algorithm its `kty` and `crv` allow. Non-empty.
   *
   * @defaultValue every asymmetric key management algorithm: `RSA-OAEP`, `RSA-OAEP-256`, `ECDH-ES`,
   * `ECDH-ES+A128KW`, `ECDH-ES+A256KW`
   */
  readonly algorithms?: readonly AsymmetricKeyManagementAlgorithm[];
}

/**
 * Reads `options.algorithms` for an encryption key set.
 *
 * @throws TypeError when it is given and is not a non-empty array of asymmetric key management algorithms.
 */
export function readEncryptionAlgorithms(
  options: object,
  functionName: string,
): ReadonlySet<AsymmetricKeyManagementAlgorithm> {
  const { algorithms } = options as { algorithms?: unknown };
  if (algorithms === undefined) {
    return new Set(ASYMMETRIC_KEY_MANAGEMENT_ALGORITHMS);
  }
  if (!Array.isArray(algorithms) || algorithms.length === 0 || !algorithms.every(isAsymmetricKeyManagementAlgorithm)) {
    throw new TypeError(
      `${functionName}: options.algorithms must be a non-empty array of ${ASYMMETRIC_KEY_MANAGEMENT_ALGORITHMS.join(", ")} with use "enc".`,
    );
  }
  return new Set(algorithms);
}

/** The JWE operations a public key may carry in `key_ops` to say it encrypts. */
const PUBLIC_ENCRYPTION_OPERATIONS = ["encrypt", "wrapKey", "deriveKey", "deriveBits"];

/**
 * Imports the encryption keys of a JWKS's entries: each JWK that says it encrypts, by `use: "enc"` or by
 * `key_ops`, once per allowed algorithm it fits. A JWK that says neither is skipped, so a JWKS that serves
 * signing and encryption keys side by side never yields a signing key here, nor the reverse. A JWK that fails
 * its checks is skipped, as `importKeySet` skips one.
 */
export async function importEncryptionKeys(
  entries: readonly unknown[],
  algorithms: ReadonlySet<AsymmetricKeyManagementAlgorithm>,
): Promise<readonly JwePublicKey[]> {
  const attempts = entries.flatMap((jwk) =>
    bindableAlgorithms(jwk, algorithms).map(async (alg) => importJwePublicKey(jwk, { alg })),
  );
  const results = await Promise.all(attempts);
  return Object.freeze(results.flatMap((result) => (result.ok ? [result.value] : [])));
}

function saysEncryption(jwk: object): boolean {
  const use = ownDataValue(jwk, "use");
  if (use !== undefined) {
    return use === "enc";
  }
  const operations = ownDataValue(jwk, "key_ops");
  return Array.isArray(operations) && operations.some((op) => PUBLIC_ENCRYPTION_OPERATIONS.includes(op as string));
}

function bindableAlgorithms(
  jwk: unknown,
  algorithms: ReadonlySet<AsymmetricKeyManagementAlgorithm>,
): AsymmetricKeyManagementAlgorithm[] {
  try {
    if (typeof jwk !== "object" || jwk === null || !saysEncryption(jwk)) {
      return [];
    }
    const alg = ownDataValue(jwk, "alg");
    if (alg !== undefined) {
      return isAsymmetricKeyManagementAlgorithm(alg) && algorithms.has(alg) ? [alg] : [];
    }
    const kty = ownDataValue(jwk, "kty");
    const crv = ownDataValue(jwk, "crv");
    const fits = (candidate: AsymmetricKeyManagementAlgorithm): boolean =>
      candidate.startsWith("RSA") ? kty === "RSA" : isJweCurve(crv) && CURVE_PARAMS[crv].kty === kty;
    return [...algorithms].filter(fits);
  } catch {
    // A hostile Proxy can throw from any trap; such a JWK binds to nothing.
    return [];
  }
}

/** Wraps encryption keys, already checked, into a frozen key set. */
export function encryptionKeySetOf(keys: readonly JwePublicKey[]): LocalEncryptionKeySet {
  return Object.freeze({
    keys,
    select: async (query: EncryptionKeyQuery): Promise<JwtResult<JwePublicKey>> => selectKey(keys, query),
  });
}
