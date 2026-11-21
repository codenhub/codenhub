import { ok } from "../core";
import { rejectUnknownOptions } from "../core/options";
import type { JwtResult } from "../core/types";
import { ownDataValue } from "../keys/algorithms";
import { readEntries } from "../keysets/local";
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

/** How {@link importEncryptionKeySet} and `createRemoteEncryptionKeySet` read a JWKS of encryption keys. */
export interface ImportEncryptionKeySetOptions {
  /**
   * Key management algorithms keys may be bound to. A JWK naming another in its `alg` is skipped, and a JWK
   * without `alg` is bound to each listed algorithm its `kty` and `crv` allow. Non-empty.
   *
   * @defaultValue every asymmetric key management algorithm: `RSA-OAEP`, `RSA-OAEP-256`, `RSA-OAEP-384`,
   * `RSA-OAEP-512`, `ECDH-ES`, `ECDH-ES+A128KW`, `ECDH-ES+A256KW`
   */
  readonly algorithms?: readonly AsymmetricKeyManagementAlgorithm[];
}

const IMPORT_ENCRYPTION_KEY_SET_OPTIONS: Readonly<Record<keyof ImportEncryptionKeySetOptions, true>> = {
  algorithms: true,
};

/**
 * Imports the public encryption keys of an untrusted JWKS, such as the `jwks_uri` document of an OpenID client
 * that wants its ID tokens encrypted, as a key set a sender selects the key to encrypt to from.
 *
 * @remarks
 * Only a JWK that says it encrypts, by a `use` of `enc` or by a `key_ops` holding an encryption operation, is
 * imported, so a JWKS that serves signing and encryption keys side by side never yields a signing key here; a
 * JWK with an `alg` is bound to that algorithm when it is allowed, and a JWK without one to every allowed key
 * management algorithm its `kty` and `crv` fit. JWKs that cannot be used are skipped rather than failing the
 * import, as {@link importKeySet} skips them. The set's `select` takes `{ alg, kid }`.
 *
 * @example
 * ```ts
 * const result = await importEncryptionKeySet(clientJwks, { algorithms: ["ECDH-ES+A256KW"] });
 * if (result.ok) {
 *   const key = await result.value.select({ alg: "ECDH-ES+A256KW" });
 * }
 * ```
 *
 * @param jwks - The JWKS, an object with a `keys` array. Any value is accepted.
 * @param options - Which key management algorithms keys may be bound to.
 * @returns The frozen key set, or a failure with one issue, as {@link importKeySet} gives for a JWKS that is not
 * one. Never throws for any `jwks`.
 * @throws TypeError when `options` is not an object, has a member that is not an option, or its `algorithms` is
 * not a non-empty array of asymmetric key management algorithms.
 */
export async function importEncryptionKeySet(
  jwks: unknown,
  options?: ImportEncryptionKeySetOptions,
): Promise<JwtResult<LocalEncryptionKeySet>> {
  const algorithms = readEncryptionAlgorithms(options, "importEncryptionKeySet");
  if (options !== undefined) {
    rejectUnknownOptions(options, IMPORT_ENCRYPTION_KEY_SET_OPTIONS, "importEncryptionKeySet");
  }
  const entries = readEntries(jwks);
  return entries.ok ? ok(encryptionKeySetOf(await importEncryptionKeys(entries.value, algorithms))) : entries;
}

/**
 * Reads and checks the `algorithms` option of `importEncryptionKeySet` and `createRemoteEncryptionKeySet`, as
 * `readAlgorithms` does for signing; each caller checks its own option names.
 *
 * @throws TypeError when `options` is not an object, or `algorithms` is given and is not a non-empty array of
 * asymmetric key management algorithms.
 */
export function readEncryptionAlgorithms(
  options: unknown,
  functionName: string,
): ReadonlySet<AsymmetricKeyManagementAlgorithm> {
  if (options === undefined) {
    return new Set(ASYMMETRIC_KEY_MANAGEMENT_ALGORITHMS);
  }
  if (typeof options !== "object" || options === null) {
    throw new TypeError(`${functionName}: options must be an object.`);
  }
  const { algorithms } = options as { algorithms?: unknown };
  if (algorithms === undefined) {
    return new Set(ASYMMETRIC_KEY_MANAGEMENT_ALGORITHMS);
  }
  if (!Array.isArray(algorithms) || algorithms.length === 0 || !algorithms.every(isAsymmetricKeyManagementAlgorithm)) {
    throw new TypeError(
      `${functionName}: options.algorithms must be a non-empty array of ${ASYMMETRIC_KEY_MANAGEMENT_ALGORITHMS.join(", ")}.`,
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
 * its checks is skipped, as `importKeySet` skips one. Never throws.
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
