import { fail, ok } from "../core";
import type { AsymmetricAlgorithm, JwtHeader, JwtResult, KeySet, VerificationKey } from "../core/types";
import {
  ASYMMETRIC_ALGORITHMS,
  compatibleAlgorithms,
  getKeyEntry,
  importPublicKey,
  isAsymmetricAlgorithm,
} from "../keys";
import { selectKey } from "./select";

/** Most keys a JWKS may hold, so an oversized key set cannot make import cost unbounded. */
export const MAX_JWKS_KEYS = 100;

/** How {@link importKeySet} chooses which keys of a JWKS to import. */
export interface ImportKeySetOptions {
  /**
   * Algorithms keys may be bound to. A JWK naming another algorithm in its `alg` is skipped, and a JWK
   * without `alg` is bound only to the listed algorithms its `kty` and `crv` allow. Non-empty.
   *
   * @defaultValue every asymmetric algorithm: `ES256`, `EdDSA`, `Ed25519`, `RS256`, `PS256`
   */
  readonly algorithms?: readonly AsymmetricAlgorithm[];
}

/**
 * Builds a key set from keys this package created, for verifying tokens against a fixed set.
 *
 * @remarks
 * Selection follows {@link KeySet.select}: with a `kid`, only keys with that `kid` are candidates;
 * without one, the set must hold exactly one key with the header's `alg`. Keys are never tried in turn.
 *
 * @example
 * ```ts
 * const keys = createKeySet([currentKey, previousKey]);
 * const verify = createVerifier({ keys, issuer: "https://issuer.example" });
 * ```
 *
 * @param keys - Public and secret keys from `import*` or `generate*`. No two may share both `kid` and
 * `alg`, and two keys without a `kid` may not share an `alg`.
 * @returns A frozen key set holding a copy of `keys`.
 * @throws TypeError when `keys` is not a non-empty array, holds a value that is not a public or secret
 * key created by this package, or holds two keys with the same `kid` and `alg`.
 */
export function createKeySet(keys: readonly VerificationKey[]): KeySet {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new TypeError("createKeySet: keys must be a non-empty array.");
  }
  const seen = new Set<string>();
  for (const key of keys as readonly unknown[]) {
    getKeyEntry(key);
    const { kind, kid, alg } = key as VerificationKey | { kind: "private"; kid?: string; alg: string };
    if (kind === "private") {
      throw new TypeError("createKeySet: keys must be public or secret keys, not private keys.");
    }
    const identity = JSON.stringify([kid ?? null, alg]);
    if (seen.has(identity)) {
      throw new TypeError("createKeySet: two keys share the same kid and alg.");
    }
    seen.add(identity);
  }
  return keySetOf(Object.freeze([...keys]));
}

/**
 * Imports the public keys of an untrusted JWKS, such as an issuer's `jwks_uri` document, as a key set.
 *
 * @remarks
 * A JWK with an `alg` is bound to that algorithm when it is allowed; a JWK without one is bound to every
 * allowed algorithm its `kty` and `crv` fit, so an RSA key may become both an `RS256` and a `PS256` key.
 * JWKs that cannot be used are skipped rather than failing the import: `oct` keys and `HS256` (secrets
 * never come from a JWKS), keys for encryption, keys carrying private members, weak or malformed keys,
 * and keys whose `alg` is not allowed. A JWKS with no usable key gives an empty set, whose `select`
 * always fails. Two usable keys with the same `kid` and `alg` are kept; selecting them fails with
 * `ambiguous_key` rather than picking one.
 *
 * @example
 * ```ts
 * const result = await importKeySet(await response.json(), { algorithms: ["RS256"] });
 * if (result.ok) verify = createVerifier({ keys: result.value });
 * ```
 *
 * @param jwks - The JWKS, an object with a `keys` array. Any value is accepted.
 * @param options - Which algorithms keys may be bound to.
 * @returns The frozen key set, or a failure with one issue: `malformed` when `jwks` is not an object
 * (path omitted) or its `keys` is not an array (path `["keys"]`), or `too_large` with
 * `{ limit: "keys", maximum: 100 }` for more than 100 keys. Never throws for any `jwks`.
 * @throws TypeError when `options` is not an object or `options.algorithms` is not a non-empty array of
 * asymmetric algorithms.
 */
export async function importKeySet(jwks: unknown, options?: ImportKeySetOptions): Promise<JwtResult<KeySet>> {
  const algorithms = readAlgorithms(options, "importKeySet");
  const imported = await importKeys(jwks, algorithms);
  return imported.ok ? ok(keySetOf(imported.value)) : imported;
}

/** Wraps keys, already checked, into a frozen key set. */
export function keySetOf(keys: readonly VerificationKey[]): KeySet {
  return Object.freeze({
    select: async (header: JwtHeader): Promise<JwtResult<VerificationKey>> => selectKey(keys, header),
  });
}

/**
 * Reads and checks the `algorithms` option of `importKeySet` and `createRemoteKeySet`.
 *
 * @throws TypeError when `options` is not an object or `algorithms` is not a non-empty array of
 * asymmetric algorithms.
 */
export function readAlgorithms(options: unknown, functionName: string): ReadonlySet<AsymmetricAlgorithm> {
  if (options === undefined) {
    return new Set(ASYMMETRIC_ALGORITHMS);
  }
  if (typeof options !== "object" || options === null) {
    throw new TypeError(`${functionName}: options must be an object.`);
  }
  const { algorithms } = options as { algorithms?: unknown };
  if (algorithms === undefined) {
    return new Set(ASYMMETRIC_ALGORITHMS);
  }
  if (!Array.isArray(algorithms) || algorithms.length === 0 || !algorithms.every(isAsymmetricAlgorithm)) {
    throw new TypeError(
      `${functionName}: options.algorithms must be a non-empty array of ES256, EdDSA, Ed25519, RS256, PS256.`,
    );
  }
  return new Set(algorithms);
}

/** Imports every usable public key of an untrusted JWKS, skipping the unusable ones. Never throws. */
export async function importKeys(
  jwks: unknown,
  algorithms: ReadonlySet<AsymmetricAlgorithm>,
): Promise<JwtResult<readonly VerificationKey[]>> {
  const entries = readEntries(jwks);
  if (!entries.ok) {
    return entries;
  }
  const attempts = entries.value.flatMap((jwk) =>
    bindableAlgorithms(jwk, algorithms).map((alg) => importPublicKey(jwk, { alg })),
  );
  const results = await Promise.all(attempts);
  return ok(Object.freeze(results.flatMap((result) => (result.ok ? [result.value] : []))));
}

const MALFORMED_JWKS = fail({ code: "malformed" });
const MALFORMED_KEYS = fail({ code: "malformed", path: ["keys"] });
const TOO_MANY_KEYS = fail({ code: "too_large", params: { limit: "keys", maximum: MAX_JWKS_KEYS } });

/** Reads the entries of a JWKS. The result is not deep-frozen, since the entries belong to the caller. */
function readEntries(jwks: unknown): JwtResult<readonly unknown[]> {
  try {
    if (typeof jwks !== "object" || jwks === null || Array.isArray(jwks)) {
      return MALFORMED_JWKS;
    }
    const keys = ownValue(jwks, "keys");
    if (!Array.isArray(keys)) {
      return MALFORMED_KEYS;
    }
    if (keys.length > MAX_JWKS_KEYS) {
      return TOO_MANY_KEYS;
    }
    return Object.freeze({ ok: true as const, value: Array.from(keys as unknown[]) });
  } catch {
    // A hostile Proxy or getter can throw from any read; such a JWKS is not one this package understands.
    return MALFORMED_JWKS;
  }
}

/** The allowed algorithms a JWK may be bound to: its own `alg`, or every one its `kty` and `crv` fit. */
function bindableAlgorithms(jwk: unknown, algorithms: ReadonlySet<AsymmetricAlgorithm>): AsymmetricAlgorithm[] {
  try {
    if (typeof jwk !== "object" || jwk === null) {
      return [];
    }
    const alg = ownValue(jwk, "alg");
    if (alg !== undefined) {
      return isAsymmetricAlgorithm(alg) && algorithms.has(alg) ? [alg] : [];
    }
    return compatibleAlgorithms(jwk).filter(
      (candidate): candidate is AsymmetricAlgorithm => isAsymmetricAlgorithm(candidate) && algorithms.has(candidate),
    );
  } catch {
    return [];
  }
}

/** Reads an own data property without running getters. */
function ownValue(target: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}
