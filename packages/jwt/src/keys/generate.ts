import type { AsymmetricAlgorithm, PrivateKey, PublicKey, SecretKey, SymmetricAlgorithm } from "../core/types";
import { ALGORITHM_PARAMS } from "./algorithms";
import {
  ownMember,
  readExtractable,
  readKid,
  requireAsymmetricAlg,
  requireOptions,
  requireSymmetricAlg,
} from "./options";
import { kidMember, registerKey } from "./registry";
import { cryptoKeyThumbprint, THUMBPRINT_KID } from "./thumbprint";
import { generatePair, OKP_GENERATION_RETRIES, RSA_PUBLIC_EXPONENT } from "./web-crypto";

/** RSA modulus lengths {@link generateKeyPair} accepts, in bits. */
export type RsaModulusLength = 2048 | 3072 | 4096;

/** What {@link generateKeyPair} creates. */
export interface GenerateKeyPairOptions {
  /** The one algorithm both keys are bound to. */
  readonly alg: AsymmetricAlgorithm;
  /**
   * Key identifier given to both keys. The literal `"thumbprint"` is reserved: it gives both keys the
   * public key's RFC 7638 thumbprint, as {@link jwkThumbprint} computes it, so the `kid` is stable and
   * derived from the key alone.
   *
   * @defaultValue no `kid`
   */
  readonly kid?: string;
  /**
   * Whether {@link exportPrivateJwk} may export the private key. The public key is always exportable.
   *
   * @defaultValue false
   */
  readonly extractable?: boolean;
  /**
   * RSA modulus length in bits. Only for the `RS*` and `PS*` algorithms.
   *
   * @defaultValue 2048
   */
  readonly modulusLength?: RsaModulusLength;
}

/** What {@link generateSecretKey} creates. */
export interface GenerateSecretKeyOptions {
  /** The one algorithm the secret signs and verifies with. */
  readonly alg: SymmetricAlgorithm;
  /**
   * Key identifier.
   *
   * @defaultValue no `kid`
   */
  readonly kid?: string;
  /**
   * Whether {@link exportSecretJwk} may export the secret.
   *
   * @defaultValue false
   */
  readonly extractable?: boolean;
}

const KEY_PAIR_OPTIONS: Readonly<Record<keyof GenerateKeyPairOptions, true>> = {
  alg: true,
  kid: true,
  extractable: true,
  modulusLength: true,
};

const SECRET_KEY_OPTIONS: Readonly<Record<keyof GenerateSecretKeyOptions, true>> = {
  alg: true,
  kid: true,
  extractable: true,
};

/** A generated key pair. Frozen. */
export interface KeyPair {
  /** Signs tokens. */
  readonly privateKey: PrivateKey;
  /** Verifies what {@link KeyPair.privateKey} signed. */
  readonly publicKey: PublicKey;
}

const RSA_MODULUS_LENGTHS: readonly number[] = [2048, 3072, 4096];
const DEFAULT_RSA_MODULUS_LENGTH = 2048;
const BITS_PER_BYTE = 8;

/**
 * Generates a key pair bound to one asymmetric algorithm.
 *
 * @example
 * ```ts
 * const { privateKey, publicKey } = await generateKeyPair({ alg: "ES256", kid: "2026-10" });
 * const named = await generateKeyPair({ alg: "ES256", kid: "thumbprint" }); // kid: the RFC 7638 thumbprint
 * ```
 *
 * @param options - The algorithm, an optional `kid` (`"thumbprint"` for the key's thumbprint), whether the private key may be exported, and
 * the RSA modulus length.
 * @returns The frozen pair. Both keys carry the same `alg` and `kid`.
 * @remarks For `EdDSA` and `Ed25519`, a generation that Web Crypto rejects with `OperationError` is
 * retried up to three times, since Linux WebKit fails about 1 in 128 at random.
 * @throws TypeError when `options` is not an object, `options.alg` is not an asymmetric algorithm,
 * `options.kid` is not a string, `options.extractable` is not a boolean, or `options.modulusLength`
 * is given for a non-RSA algorithm or is not 2048, 3072 or 4096.
 */
export async function generateKeyPair(options: GenerateKeyPairOptions): Promise<KeyPair> {
  const checked = requireOptions(options, KEY_PAIR_OPTIONS, "generateKeyPair");
  const alg = requireAsymmetricAlg(checked, "generateKeyPair");
  const optionKid = readKid(checked, "generateKeyPair");
  const isExtractable = readExtractable(checked, "generateKeyPair");
  const modulusLength = readModulusLength(checked, alg);
  const params = ALGORITHM_PARAMS[alg];
  const generateParams =
    params.kty === "RSA"
      ? { ...(params.importParams as RsaHashedImportParams), modulusLength, publicExponent: RSA_PUBLIC_EXPONENT }
      : params.importParams;
  const retries = params.kty === "OKP" ? OKP_GENERATION_RETRIES : 0;
  const pair = await generatePair(generateParams, isExtractable, ["sign", "verify"], retries);
  const signatureLength = params.kty === "RSA" ? modulusLength / BITS_PER_BYTE : (params.signatureBytes as number);
  const kid = optionKid === THUMBPRINT_KID ? await cryptoKeyThumbprint(pair.publicKey, alg) : optionKid;
  return Object.freeze({
    privateKey: registerKey<PrivateKey>(
      { kind: "private", alg, ...kidMember(kid), extractable: isExtractable },
      { cryptoKey: pair.privateKey, signatureLength, publicCryptoKey: pair.publicKey },
    ),
    publicKey: registerKey<PublicKey>(
      { kind: "public", alg, ...kidMember(kid) },
      { cryptoKey: pair.publicKey, signatureLength },
    ),
  });
}

/**
 * Generates a random HMAC secret bound to one algorithm, as long as its hash output: 32 bytes for
 * `HS256`, 48 for `HS384` and 64 for `HS512`.
 *
 * @param options - The algorithm, an optional `kid`, and whether the secret may be exported.
 * @returns The frozen key.
 * @throws TypeError when `options` is not an object, `options.alg` is not `HS256`, `HS384` or `HS512`,
 * `options.kid` is not a string, or `options.extractable` is not a boolean.
 */
export async function generateSecretKey(options: GenerateSecretKeyOptions): Promise<SecretKey> {
  const checked = requireOptions(options, SECRET_KEY_OPTIONS, "generateSecretKey");
  const alg = requireSymmetricAlg(checked, "generateSecretKey");
  const kid = readKid(checked, "generateSecretKey");
  const isExtractable = readExtractable(checked, "generateSecretKey");
  const params = ALGORITHM_PARAMS[alg];
  // RFC 7518 §3.2: the secret is as long as the hash output, which is the signature length.
  const length = params.signatureBytes as number;
  const cryptoKey = await crypto.subtle.generateKey(
    { ...(params.importParams as HmacImportParams), length: length * BITS_PER_BYTE },
    isExtractable,
    ["sign", "verify"],
  );
  return registerKey<SecretKey>(
    { kind: "secret", alg, ...kidMember(kid), extractable: isExtractable },
    { cryptoKey, signatureLength: length },
  );
}

function readModulusLength(options: Record<string, unknown>, alg: AsymmetricAlgorithm): number {
  const modulusLength = ownMember(options, "modulusLength");
  if (modulusLength === undefined) {
    return DEFAULT_RSA_MODULUS_LENGTH;
  }
  if (ALGORITHM_PARAMS[alg].kty !== "RSA") {
    throw new TypeError("generateKeyPair: options.modulusLength is only allowed for RSA algorithms.");
  }
  if (typeof modulusLength !== "number" || !RSA_MODULUS_LENGTHS.includes(modulusLength)) {
    throw new TypeError("generateKeyPair: options.modulusLength must be 2048, 3072 or 4096.");
  }
  return modulusLength;
}
