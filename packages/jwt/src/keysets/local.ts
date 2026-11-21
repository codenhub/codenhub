import { fail, ok } from "../core";
import { rejectUnknownOptions } from "../core/options";
import type { AsymmetricAlgorithm, JwtHeader, JwtResult, LocalKeySet, VerificationKey } from "../core/types";
import {
  ASYMMETRIC_ALGORITHMS,
  bindIssuer,
  compatibleAlgorithms,
  getKeyEntry,
  isAsymmetricAlgorithm,
  ownDataValue,
  readIssuer,
} from "../keys";
import { importPublicJwk } from "../keys/import";
import { selectKey } from "./select";

/** Most keys a JWKS may hold, so an oversized key set cannot make import cost unbounded. */
export const MAX_JWKS_KEYS = 100;

/** How {@link importKeySet} chooses which keys of a JWKS to import. */
export interface ImportKeySetOptions {
  /**
   * Algorithms keys may be bound to. A JWK naming another algorithm in its `alg` is skipped, and a JWK
   * without `alg` is bound only to the listed algorithms its `kty` and `crv` allow. Non-empty.
   *
   * @defaultValue every asymmetric algorithm: `ES256`, `ES384`, `ES512`, `EdDSA`, `Ed25519`, `RS256`, `RS384`,
   * `RS512`, `PS256`, `PS384`, `PS512`
   */
  readonly algorithms?: readonly AsymmetricAlgorithm[];
  /**
   * The issuer whose keys these are. Each key is bound to it (see {@link PublicKey.issuer}), so a token
   * verified with one of them must carry this `iss`. Give it whenever keys of several issuers can reach
   * one verifier.
   *
   * @defaultValue keys bound to no issuer
   */
  readonly issuer?: string;
}

const IMPORT_KEY_SET_OPTIONS: Readonly<Record<keyof ImportKeySetOptions, true>> = {
  algorithms: true,
  issuer: true,
};

/** How {@link createKeySet} builds its set. */
export interface CreateKeySetOptions {
  /**
   * The issuer whose keys these are, as for {@link ImportKeySetOptions.issuer}. The set holds copies of the
   * keys bound to it.
   *
   * @defaultValue the keys as given
   */
  readonly issuer?: string;
}

const CREATE_KEY_SET_OPTIONS: Readonly<Record<keyof CreateKeySetOptions, true>> = { issuer: true };

/**
 * Builds a key set from keys this package created, for verifying tokens against a fixed set.
 *
 * @remarks
 * Selection follows {@link KeySet.select}: with a `kid`, only keys with that `kid` are candidates, and
 * when no key has it, the one key without a `kid` that has the header's `alg` stands in; without a `kid`,
 * the set must hold exactly one key with the header's `alg`. Keys are never tried in turn.
 *
 * @example
 * ```ts
 * const keys = createKeySet([currentKey, previousKey]);
 * const verify = createVerifier({ keys, issuer: "https://issuer.example" });
 * ```
 *
 * @param keys - Public and secret keys from `import*` or `generate*`. No two may share both `kid` and
 * `alg`, and two keys without a `kid` may not share an `alg`.
 * @param options - The issuer the keys belong to.
 * @returns A frozen key set holding a copy of `keys`, which its `keys` lists; with `issuer`, each key
 * bound to it.
 * @throws TypeError when `keys` is not a non-empty array, holds a value that is not a public or secret
 * key created by this package, or holds two keys with the same `kid` and `alg`; when `options` is not an
 * object or has a member that is not an option; when `options.issuer` is not a non-empty string; or when
 * a key is already bound to another issuer.
 */
export function createKeySet(keys: readonly VerificationKey[], options?: CreateKeySetOptions): LocalKeySet {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new TypeError("createKeySet: keys must be a non-empty array.");
  }
  if (options !== undefined) {
    if (typeof options !== "object" || options === null) {
      throw new TypeError("createKeySet: options must be an object.");
    }
    rejectUnknownOptions(options, CREATE_KEY_SET_OPTIONS, "createKeySet");
  }
  const issuer = readIssuer(options, "createKeySet");
  // Copied once, by index, so the set holds exactly the keys checked below.
  const snapshot: readonly unknown[] = Array.from({ length: keys.length }, (_, index) => keys[index]);
  const seen = new Set<string>();
  for (const key of snapshot) {
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
  const checked = snapshot as VerificationKey[];
  return keySetOf(
    Object.freeze(issuer === undefined ? checked : checked.map((key) => bindIssuer(key, issuer, "createKeySet"))),
  );
}

/**
 * Imports the public keys of an untrusted JWKS, such as an issuer's `jwks_uri` document, as a key set.
 *
 * @remarks
 * A JWK with an `alg` is bound to that algorithm when it is allowed; a JWK without one is bound to every
 * allowed algorithm its `kty` and `crv` fit, so an RSA key may become an `RS256`, `RS384`, `RS512`,
 * `PS256`, `PS384` and `PS512` key. JWKs that cannot be used are skipped rather than failing the import:
 * `oct` keys and the HMAC algorithms (secrets never come from a JWKS), keys for encryption, keys carrying
 * private members, weak or malformed keys, and keys whose `alg` is not allowed. A JWKS with no usable key gives an empty set, whose `select`
 * always fails. Two usable keys with the same `kid` and `alg` are kept; selecting them fails with
 * `ambiguous_key` rather than picking one. {@link importEncryptionKeySet} imports a JWKS's encryption keys.
 *
 * @example
 * ```ts
 * const result = await importKeySet(await response.json(), { algorithms: ["RS256"] });
 * if (result.ok) verify = createVerifier({ keys: result.value });
 * ```
 *
 * @param jwks - The JWKS, an object with a `keys` array. Any value is accepted.
 * @param options - Which algorithms keys may be bound to, and the issuer they belong to.
 * @returns The frozen key set, or a failure with one issue: `malformed` when `jwks` is not an object
 * (path omitted) or its `keys` is not an array (path `["keys"]`), or `too_large` with
 * `{ limit: "keys", maximum: 100 }` for more than 100 keys. Never throws for any `jwks`.
 * @throws TypeError when `options` is not an object, has a member that is not an option, `options.algorithms` is
 * not a non-empty array of asymmetric algorithms, or `options.issuer` is not a non-empty string.
 */
export async function importKeySet(jwks: unknown, options?: ImportKeySetOptions): Promise<JwtResult<LocalKeySet>> {
  const algorithms = readAlgorithms(options, "importKeySet");
  if (options !== undefined) {
    rejectUnknownOptions(options, IMPORT_KEY_SET_OPTIONS, "importKeySet");
  }
  const imported = await importKeys(jwks, algorithms, readIssuer(options, "importKeySet"));
  return imported.ok ? ok(keySetOf(imported.value)) : imported;
}

/** Wraps keys, already checked, into a frozen key set. */
export function keySetOf(keys: readonly VerificationKey[]): LocalKeySet {
  return Object.freeze({
    keys,
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
      `${functionName}: options.algorithms must be a non-empty array of ${ASYMMETRIC_ALGORITHMS.join(", ")}.`,
    );
  }
  return new Set(algorithms);
}

/**
 * Imports every usable public key of an untrusted JWKS, skipping the unusable ones, and binds each to
 * `issuer` when there is one. Never throws.
 */
export async function importKeys(
  jwks: unknown,
  algorithms: ReadonlySet<AsymmetricAlgorithm>,
  issuer: string | undefined,
): Promise<JwtResult<readonly VerificationKey[]>> {
  const entries = readEntries(jwks);
  if (!entries.ok) {
    return entries;
  }
  const attempts = entries.value.flatMap((jwk) =>
    bindableAlgorithms(jwk, algorithms).map(async (alg) => {
      const result = await importPublicJwk(jwk, alg);
      // A freshly imported key has no issuer, so binding it cannot throw.
      return result.ok && issuer !== undefined ? ok(bindIssuer(result.value, issuer, "importKeys")) : result;
    }),
  );
  const results = await Promise.all(attempts);
  return ok(Object.freeze(results.flatMap((result) => (result.ok ? [result.value] : []))));
}

const MALFORMED_JWKS = fail({ code: "malformed" });
const MALFORMED_KEYS = fail({ code: "malformed", path: ["keys"] });
const TOO_MANY_KEYS = fail({ code: "too_large", params: { limit: "keys", maximum: MAX_JWKS_KEYS } });

/** Reads the entries of a JWKS. The result is not deep-frozen, since the entries belong to the caller. */
export function readEntries(jwks: unknown): JwtResult<readonly unknown[]> {
  try {
    if (typeof jwks !== "object" || jwks === null || Array.isArray(jwks)) {
      return MALFORMED_JWKS;
    }
    const keys = ownDataValue(jwks, "keys");
    if (!Array.isArray(keys)) {
      return MALFORMED_KEYS;
    }
    const length = keys.length;
    if (length > MAX_JWKS_KEYS) {
      return TOO_MANY_KEYS;
    }
    // Copied by index: an array's own iterator could yield more entries than its checked length.
    return Object.freeze({ ok: true as const, value: Array.from({ length }, (_, index): unknown => keys[index]) });
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
    const alg = ownDataValue(jwk, "alg");
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
