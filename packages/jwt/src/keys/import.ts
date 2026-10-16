import { fail, ok } from "../core";
import type {
  AsymmetricAlgorithm,
  JwsAlgorithm,
  JwtResult,
  PrivateKey,
  PublicKey,
  SecretKey,
  SymmetricAlgorithm,
} from "../core/types";
import { ALGORITHM_PARAMS } from "./algorithms";
import { checkJwk, HS256_SIGNATURE_BYTES, MIN_HMAC_KEY_BYTES, type KeyRole } from "./jwk";
import { readExtractable, readKid, requireAsymmetricAlg, requireOptions, requireSymmetricAlg } from "./options";
import { kidMember, registerKey } from "./registry";

/** How {@link importPublicKey} binds the imported key. */
export interface ImportPublicKeyOptions {
  /** The one algorithm the key will verify with. The JWK's `kty` and `crv` must fit it. */
  readonly alg: AsymmetricAlgorithm;
}

/** How {@link importPrivateKey} binds the imported key. */
export interface ImportPrivateKeyOptions {
  /** The one algorithm the key will sign with. The JWK's `kty` and `crv` must fit it. */
  readonly alg: AsymmetricAlgorithm;
  /**
   * Whether {@link exportPrivateJwk} may later export the key's material.
   *
   * @defaultValue false
   */
  readonly extractable?: boolean;
}

/** How {@link importSecretKey} binds the imported secret. */
export interface ImportSecretKeyOptions {
  /** The one algorithm the secret will sign and verify with. */
  readonly alg: SymmetricAlgorithm;
  /**
   * Key identifier for a secret given as raw bytes. Ignored for a JWK, whose own `kid` is used.
   *
   * @defaultValue no `kid`
   */
  readonly kid?: string;
  /**
   * Whether {@link exportSecretJwk} may later export the secret.
   *
   * @defaultValue false
   */
  readonly extractable?: boolean;
}

const USAGES: Readonly<Record<KeyRole, KeyUsage[]>> = {
  public: ["verify"],
  private: ["sign"],
  secret: ["sign", "verify"],
};

/**
 * Imports an untrusted public JWK as a verification key bound to one algorithm.
 *
 * @remarks
 * The JWK's `kty` and `crv` must fit `options.alg`; a JWK `alg`, `use` or `key_ops` member, when
 * present, must agree with it. RSA moduli must be 2048 to 8192 bits. Private members are refused
 * rather than ignored.
 *
 * @example
 * ```ts
 * const result = await importPublicKey(jwk, { alg: "ES256" });
 * if (!result.ok) console.warn(result.error.issues);
 * ```
 *
 * @param jwk - The JWK, typically parsed from JSON. Any value is accepted.
 * @param options - The algorithm to bind the key to.
 * @returns The frozen key, or a failure with one issue: `invalid_key` for a non-object, a missing or
 * ill-typed member, invalid base64url, wrong coordinate lengths, or material Web Crypto rejects (such
 * as a point not on the curve); `unsupported_key` for a `kty`/`crv` that does not fit `alg` or a
 * modulus over 8192 bits; `alg_mismatch` for a JWK `alg` naming another algorithm; `wrong_use` for a
 * `use` other than `sig` or `key_ops` without `verify`; `unexpected_private_key` for any private
 * member; `weak_key` for a modulus under 2048 bits. Issues never contain JWK values. Never throws for
 * any `jwk`.
 * @throws TypeError when `options` is not an object or `options.alg` is not an asymmetric algorithm.
 */
export async function importPublicKey(jwk: unknown, options: ImportPublicKeyOptions): Promise<JwtResult<PublicKey>> {
  const checked = requireOptions(options, "importPublicKey");
  const alg = requireAsymmetricAlg(checked, "importPublicKey");
  return importJwk(jwk, { alg, role: "public", isExtractable: true }, (kid) => ({
    kind: "public",
    alg,
    ...kidMember(kid),
  }));
}

/**
 * Imports an untrusted private JWK as a signing key bound to one algorithm.
 *
 * @remarks
 * The same checks as {@link importPublicKey} apply, except that private members are required: `d`
 * for EC and OKP keys, and `d`, `p`, `q`, `dp`, `dq` and `qi` for RSA keys. `key_ops`, when present,
 * must include `sign`.
 *
 * @param jwk - The JWK, typically parsed from JSON. Any value is accepted.
 * @param options - The algorithm to bind the key to, and whether it may be exported again.
 * @returns The frozen key, or a failure with one issue: `invalid_key`, `unsupported_key` (also for
 * multi-prime RSA keys with `oth`), `alg_mismatch`, `wrong_use` or `weak_key`, as described for
 * {@link importPublicKey}. Issues never contain JWK values. Never throws for any `jwk`.
 * @throws TypeError when `options` is not an object, `options.alg` is not an asymmetric algorithm, or
 * `options.extractable` is not a boolean.
 */
export async function importPrivateKey(jwk: unknown, options: ImportPrivateKeyOptions): Promise<JwtResult<PrivateKey>> {
  const checked = requireOptions(options, "importPrivateKey");
  const alg = requireAsymmetricAlg(checked, "importPrivateKey");
  const isExtractable = readExtractable(checked, "importPrivateKey");
  return importJwk(jwk, { alg, role: "private", isExtractable }, (kid) => ({
    kind: "private",
    alg,
    ...kidMember(kid),
    extractable: isExtractable,
  }));
}

/**
 * Imports an HMAC secret, given as raw bytes or as an untrusted `oct` JWK, bound to one algorithm.
 *
 * @remarks
 * The secret must be at least 32 bytes. For a JWK, `alg`, `use` and `key_ops` (which must include
 * `sign` or `verify`) are checked as in {@link importPublicKey}, and the JWK's own `kid` is used.
 * `key_ops` does not restrict the key: a secret imported with `key_ops: ["verify"]` can still sign.
 *
 * @param input - The secret's bytes, or an `oct` JWK. Any value is accepted.
 * @param options - The algorithm, the `kid` for raw bytes, and whether the secret may be exported again.
 * @returns The frozen key, or a failure with one issue: `weak_key` with `{ minimum: 32 }` for a short
 * secret, `invalid_key` for an input that is neither bytes nor a well-formed JWK, and the JWK issues
 * described for {@link importPublicKey}. Issues never contain the secret. Never throws for any `input`.
 * @throws TypeError when `options` is not an object, `options.alg` is not `HS256`, `options.kid` is not
 * a string, or `options.extractable` is not a boolean.
 */
export async function importSecretKey(
  input: Uint8Array | unknown,
  options: ImportSecretKeyOptions,
): Promise<JwtResult<SecretKey>> {
  const checked = requireOptions(options, "importSecretKey");
  const alg = requireSymmetricAlg(checked, "importSecretKey");
  const optionKid = readKid(checked, "importSecretKey");
  const isExtractable = readExtractable(checked, "importSecretKey");
  const buildKey = (kid: string | undefined): SecretKey => ({
    kind: "secret",
    alg,
    ...kidMember(kid),
    extractable: isExtractable,
  });
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  try {
    // Copied from the typed array's own bytes: a subclass's iterator or `length` getter is never run.
    if (input instanceof Uint8Array) {
      bytes = new Uint8Array(input);
    }
  } catch {
    // A revoked Proxy throws on `instanceof`; a detached buffer throws on the copy.
    return fail({ code: "invalid_key" });
  }
  if (bytes === undefined) {
    return importJwk(input, { alg, role: "secret", isExtractable }, buildKey);
  }
  if (bytes.length < MIN_HMAC_KEY_BYTES) {
    return fail({ code: "weak_key", params: { minimum: MIN_HMAC_KEY_BYTES } });
  }
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    bytes,
    ALGORITHM_PARAMS.HS256.importParams,
    isExtractable,
    USAGES.secret,
  );
  return ok(registerKey(buildKey(optionKid), { cryptoKey, signatureLength: HS256_SIGNATURE_BYTES }));
}

interface ImportPlan {
  readonly alg: JwsAlgorithm;
  readonly role: KeyRole;
  readonly isExtractable: boolean;
}

async function importJwk<TKey extends PublicKey | PrivateKey | SecretKey>(
  jwk: unknown,
  plan: ImportPlan,
  buildKey: (kid: string | undefined) => TKey,
): Promise<JwtResult<TKey>> {
  const checked = checkJwk(jwk, plan.alg, plan.role);
  if ("code" in checked) {
    return fail(checked);
  }
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      checked.importJwk,
      ALGORITHM_PARAMS[plan.alg].importParams,
      plan.isExtractable,
      USAGES[plan.role],
    );
  } catch {
    // Web Crypto rejects material it cannot use, such as a point off the curve; its message may quote it.
    return fail({ code: "invalid_key" });
  }
  return ok(registerKey(buildKey(checked.kid), { cryptoKey, signatureLength: checked.signatureLength }));
}
