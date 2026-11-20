import { fail, ok } from "../core/result";
import type { JwtIssue, JwtResult } from "../core/types";
import { copyBytes, decodeBase64Url, encodeBase64Url, encodeUtf8, isArrayBuffer, isUint8Array } from "../encoding";
import { isCryptoKey } from "../keys/exported-jwk";
import { ownMember, readExtractable, readKid, requireOptions } from "../keys/options";
import { readPemDer } from "../keys/pem";
import { kidMember } from "../keys/registry";
import {
  ASYMMETRIC_KEY_MANAGEMENT_ALGORITHMS,
  CONTENT_ENCRYPTION_ALGORITHMS,
  CONTENT_PARAMS,
  CURVE_PARAMS,
  isAsymmetricKeyManagementAlgorithm,
  isContentEncryptionAlgorithm,
  isEcdhAlgorithm,
  isJweCurve,
  isRsaAlgorithm,
  isSymmetricKeyManagementAlgorithm,
  JWE_CURVES,
  OAEP_HASH,
  SYMMETRIC_KEY_MANAGEMENT_ALGORITHMS,
} from "./algorithms";
import { constantTimeEqual, exportContentKey, importContentKey } from "./content";
import { checkJweJwk, secretLength, type CheckedJweJwk } from "./jwk";
import { getJweKeyEntry, registerJweKey, type JweKeyEntry } from "./registry";
import type {
  AsymmetricKeyManagementAlgorithm,
  ContentEncryptionAlgorithm,
  JweCurve,
  JweJwk,
  JwePrivateKey,
  JwePublicKey,
  JweSecretKey,
  SymmetricKeyManagementAlgorithm,
} from "./types";

/** A JWE key pair. Frozen. */
export interface JweKeyPair {
  /** Decrypts tokens encrypted to {@link JweKeyPair.publicKey}. */
  readonly privateKey: JwePrivateKey;
  /** Encrypts tokens for the holder of {@link JweKeyPair.privateKey}. */
  readonly publicKey: JwePublicKey;
}

/** What {@link generateJweKeyPair} creates. */
export interface GenerateJweKeyPairOptions {
  /** The one key management algorithm both keys are bound to. */
  readonly alg: AsymmetricKeyManagementAlgorithm;
  /**
   * The curve, for the `ECDH-ES` algorithms only.
   *
   * @defaultValue `"P-256"`
   */
  readonly crv?: JweCurve;
  /**
   * Key identifier given to both keys. The literal `"thumbprint"` gives both keys the public key's RFC 7638
   * thumbprint, as for {@link generateKeyPair}.
   *
   * @defaultValue no `kid`
   */
  readonly kid?: string;
  /**
   * Whether {@link exportJwePrivateJwk} may export the private key. The public key is always exportable.
   *
   * @defaultValue false
   */
  readonly extractable?: boolean;
  /**
   * RSA modulus length in bits, for the `RSA-OAEP` algorithms only.
   *
   * @defaultValue 2048
   */
  readonly modulusLength?: 2048 | 3072 | 4096;
}

/** What {@link generateJweSecretKey} creates. */
export interface GenerateJweSecretKeyOptions {
  /** The one key management algorithm the secret is bound to. */
  readonly alg: SymmetricKeyManagementAlgorithm;
  /** For `dir` only, and required there: the one content encryption algorithm the secret is the key of. */
  readonly enc?: ContentEncryptionAlgorithm;
  /**
   * Key identifier.
   *
   * @defaultValue no `kid`
   */
  readonly kid?: string;
  /**
   * Whether {@link exportJweSecretJwk} may export the secret.
   *
   * @defaultValue false
   */
  readonly extractable?: boolean;
}

/** How {@link importJwePublicKey} binds the imported key. */
export interface ImportJwePublicKeyOptions {
  /** The one key management algorithm the key will encrypt with. The key's type must fit it. */
  readonly alg: AsymmetricKeyManagementAlgorithm;
  /**
   * Key identifier. A JWK without a `kid` takes this one, and a JWK whose own `kid` differs is `invalid_key`
   * at `["kid"]`.
   *
   * @defaultValue no `kid`
   */
  readonly kid?: string;
}

/** How {@link importJwePrivateKey} and {@link importJweKeyPair} bind the imported key. */
export interface ImportJwePrivateKeyOptions extends ImportJwePublicKeyOptions {
  /**
   * Whether {@link exportJwePrivateJwk} may later export the key's material.
   *
   * @defaultValue false
   */
  readonly extractable?: boolean;
}

/** How {@link importJweSecretKey} binds the imported secret. */
export interface ImportJweSecretKeyOptions {
  /** The one key management algorithm the secret will work with. */
  readonly alg: SymmetricKeyManagementAlgorithm;
  /** For `dir` only, and required there: the one content encryption algorithm the secret is the key of. */
  readonly enc?: ContentEncryptionAlgorithm;
  /**
   * Key identifier. A JWK without a `kid` takes this one, and a JWK whose own `kid` differs is `invalid_key`
   * at `["kid"]`.
   *
   * @defaultValue no `kid`
   */
  readonly kid?: string;
  /**
   * Whether {@link exportJweSecretJwk} may later export the secret.
   *
   * @defaultValue false
   */
  readonly extractable?: boolean;
}

const GENERATE_PAIR_OPTIONS: Readonly<Record<keyof GenerateJweKeyPairOptions, true>> = {
  alg: true,
  crv: true,
  kid: true,
  extractable: true,
  modulusLength: true,
};
const GENERATE_SECRET_OPTIONS: Readonly<Record<keyof GenerateJweSecretKeyOptions, true>> = {
  alg: true,
  enc: true,
  kid: true,
  extractable: true,
};
const PUBLIC_OPTIONS: Readonly<Record<keyof ImportJwePublicKeyOptions, true>> = { alg: true, kid: true };
const PRIVATE_OPTIONS: Readonly<Record<keyof ImportJwePrivateKeyOptions, true>> = {
  alg: true,
  kid: true,
  extractable: true,
};
const SECRET_OPTIONS: Readonly<Record<keyof ImportJweSecretKeyOptions, true>> = {
  alg: true,
  enc: true,
  kid: true,
  extractable: true,
};

const RSA_MODULUS_LENGTHS: readonly number[] = [2048, 3072, 4096];
const RSA_PUBLIC_EXPONENT = new Uint8Array([1, 0, 1]);
const THUMBPRINT_KID = "thumbprint";
/** Retries after an `OperationError` from X25519 generation, as for Ed25519 (see `generateKeyPair`). */
const OKP_GENERATION_RETRIES = 3;
const PRIVATE_MEMBERS = ["d", "p", "q", "dp", "dq", "qi"] as const;
const INVALID_KEY: JwtIssue = Object.freeze({ code: "invalid_key" });

/** The Web Crypto algorithm and usages a key of `alg` is imported with, by role. */
function webCryptoParams(
  alg: AsymmetricKeyManagementAlgorithm,
  curve: JweCurve | undefined,
): {
  readonly params: RsaHashedImportParams | EcKeyImportParams | Algorithm;
  readonly public: KeyUsage[];
  readonly private: KeyUsage[];
} {
  if (isRsaAlgorithm(alg)) {
    return { params: { name: "RSA-OAEP", hash: OAEP_HASH[alg] }, public: ["encrypt"], private: ["decrypt"] };
  }
  return { params: CURVE_PARAMS[curve as JweCurve].importParams, public: [], private: ["deriveBits"] };
}

function requireAsymmetric(options: Record<string, unknown>, functionName: string): AsymmetricKeyManagementAlgorithm {
  const alg = ownMember(options, "alg");
  if (!isAsymmetricKeyManagementAlgorithm(alg)) {
    throw new TypeError(
      `${functionName}: options.alg must be one of ${ASYMMETRIC_KEY_MANAGEMENT_ALGORITHMS.join(", ")}.`,
    );
  }
  return alg;
}

function requireSymmetric(
  options: Record<string, unknown>,
  functionName: string,
): { readonly alg: SymmetricKeyManagementAlgorithm; readonly enc: ContentEncryptionAlgorithm | undefined } {
  const alg = ownMember(options, "alg");
  if (!isSymmetricKeyManagementAlgorithm(alg)) {
    throw new TypeError(
      `${functionName}: options.alg must be one of ${SYMMETRIC_KEY_MANAGEMENT_ALGORITHMS.join(", ")}.`,
    );
  }
  const enc = ownMember(options, "enc");
  if (alg !== "dir") {
    if (enc !== undefined) {
      throw new TypeError(`${functionName}: options.enc is only allowed with alg "dir".`);
    }
    return { alg, enc: undefined };
  }
  if (!isContentEncryptionAlgorithm(enc)) {
    throw new TypeError(
      `${functionName}: options.enc is required with alg "dir" and must be one of ${CONTENT_ENCRYPTION_ALGORITHMS.join(", ")}.`,
    );
  }
  return { alg, enc };
}

/**
 * Generates a key pair for one key management algorithm: an RSA-OAEP pair, or an `ECDH-ES` pair on a NIST curve
 * or X25519.
 *
 * @example
 * ```ts
 * const { publicKey, privateKey } = await generateJweKeyPair({ alg: "ECDH-ES+A256KW", kid: "thumbprint" });
 * ```
 *
 * @returns The frozen pair.
 * @throws TypeError when `options` is not an object, has a member that is not an option, `alg` is not an
 * asymmetric key management algorithm, `crv` is given for an RSA algorithm or is not `P-256`, `P-384`, `P-521` or
 * `X25519`, `modulusLength` is given for an `ECDH-ES` algorithm or is not 2048, 3072 or 4096, `kid` is not a
 * string, or `extractable` is not a boolean.
 */
export async function generateJweKeyPair(options: GenerateJweKeyPairOptions): Promise<JweKeyPair> {
  const name = "generateJweKeyPair";
  const checked = requireOptions(options, GENERATE_PAIR_OPTIONS, name);
  const alg = requireAsymmetric(checked, name);
  const optionKid = readKid(checked, name);
  const isExtractable = readExtractable(checked, name);
  const crv = ownMember(checked, "crv");
  const modulusLength = ownMember(checked, "modulusLength");
  let generateParams: RsaHashedKeyGenParams | EcKeyGenParams | Algorithm;
  let curve: JweCurve | undefined;
  if (isRsaAlgorithm(alg)) {
    if (crv !== undefined) {
      throw new TypeError(`${name}: options.crv is only allowed for the ECDH-ES algorithms.`);
    }
    if (
      modulusLength !== undefined &&
      (typeof modulusLength !== "number" || !RSA_MODULUS_LENGTHS.includes(modulusLength))
    ) {
      throw new TypeError(`${name}: options.modulusLength must be 2048, 3072 or 4096.`);
    }
    generateParams = {
      name: "RSA-OAEP",
      hash: OAEP_HASH[alg],
      modulusLength: (modulusLength as number | undefined) ?? 2048,
      publicExponent: RSA_PUBLIC_EXPONENT,
    };
  } else {
    if (modulusLength !== undefined) {
      throw new TypeError(`${name}: options.modulusLength is only allowed for the RSA-OAEP algorithms.`);
    }
    if (crv !== undefined && !isJweCurve(crv)) {
      throw new TypeError(`${name}: options.crv must be one of ${JWE_CURVES.join(", ")}.`);
    }
    curve = crv ?? "P-256";
    generateParams = CURVE_PARAMS[curve].importParams;
  }
  const usages = webCryptoParams(alg, curve);
  const pair = await generatePair(
    generateParams,
    isExtractable,
    [...usages.public, ...usages.private],
    curve === "X25519" ? OKP_GENERATION_RETRIES : 0,
  );
  const modulusBytes = isRsaAlgorithm(alg) ? (generateParams as RsaHashedKeyGenParams).modulusLength / 8 : undefined;
  const kid = optionKid === THUMBPRINT_KID ? await publicThumbprint(pair.publicKey, alg) : optionKid;
  return registerPair(alg, kid, isExtractable, {
    privateCryptoKey: pair.privateKey,
    publicCryptoKey: pair.publicKey,
    curve,
    modulusBytes,
  });
}

async function generatePair(
  algorithm: RsaHashedKeyGenParams | EcKeyGenParams | Algorithm,
  isExtractable: boolean,
  usages: KeyUsage[],
  retries: number,
): Promise<CryptoKeyPair> {
  for (let attempt = 0; ; attempt++) {
    try {
      // Each attempt runs only after the previous one failed.
      // oxlint-disable-next-line no-await-in-loop
      return (await crypto.subtle.generateKey(algorithm, isExtractable, usages)) as CryptoKeyPair;
    } catch (error) {
      if (attempt >= retries || !(error instanceof Error) || error.name !== "OperationError") {
        throw error;
      }
    }
  }
}

/**
 * Generates a random secret for `dir`, `A128KW` or `A256KW`, exactly as long as its algorithm needs: 16 or 32
 * bytes to wrap with, or the content key length of `enc` for `dir`.
 *
 * @returns The frozen secret.
 * @throws TypeError when `options` is not an object, has a member that is not an option, `alg` is not `dir`,
 * `A128KW` or `A256KW`, `enc` is missing or unsupported for `dir` or given for another `alg`, `kid` is not a
 * string, or `extractable` is not a boolean.
 */
export async function generateJweSecretKey(options: GenerateJweSecretKeyOptions): Promise<JweSecretKey> {
  const name = "generateJweSecretKey";
  const checked = requireOptions(options, GENERATE_SECRET_OPTIONS, name);
  const { alg, enc } = requireSymmetric(checked, name);
  const kid = readKid(checked, name);
  const isExtractable = readExtractable(checked, name);
  const bytes = crypto.getRandomValues(new Uint8Array(secretLength(alg, enc)));
  return secretKeyOf(alg, enc, kid, isExtractable, bytes);
}

async function secretKeyOf(
  alg: SymmetricKeyManagementAlgorithm,
  enc: ContentEncryptionAlgorithm | undefined,
  kid: string | undefined,
  isExtractable: boolean,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<JweSecretKey> {
  const entry: JweKeyEntry =
    alg === "dir"
      ? { contentKey: await importContentKey(enc as ContentEncryptionAlgorithm, bytes, isExtractable) }
      : { cryptoKey: await crypto.subtle.importKey("raw", bytes, "AES-KW", isExtractable, ["wrapKey", "unwrapKey"]) };
  return registerJweKey<JweSecretKey>(
    { kind: "jwe-secret", alg, ...(enc === undefined ? {} : { enc }), ...kidMember(kid), extractable: isExtractable },
    entry,
  );
}

/**
 * Imports an untrusted public JWK, a PEM `PUBLIC KEY` or `CERTIFICATE`, or an extractable public `CryptoKey`, as
 * an encryption key bound to one key management algorithm.
 *
 * @remarks
 * The checks are those of {@link importPublicKey}, for encryption: the JWK's `kty` must fit `alg` (`RSA` for
 * `RSA-OAEP*`; `EC` on P-256, P-384 or P-521, or `OKP` on X25519, for `ECDH-ES*`); `use`, when present, must be
 * `enc`; `key_ops`, when present, must hold only encryption operations and one a public key performs. RSA moduli
 * must be 2048 to 8192 bits. A `CryptoKey` must be an RSA-OAEP key with the hash `alg` names, or an ECDH or
 * X25519 key.
 *
 * @returns The frozen key, or a failure with one issue, by the codes {@link importPublicKey} uses; `wrong_use`
 * for `use: "sig"` or a signing operation in `key_ops`. Never throws for any `key`.
 * @throws TypeError when `options` is not an object, has a member that is not an option, `alg` is not an
 * asymmetric key management algorithm, or `kid` is not a string.
 */
export async function importJwePublicKey(
  key: unknown,
  options: ImportJwePublicKeyOptions,
): Promise<JwtResult<JwePublicKey>> {
  const name = "importJwePublicKey";
  const checked = requireOptions(options, PUBLIC_OPTIONS, name);
  const alg = requireAsymmetric(checked, name);
  const kid = readKid(checked, name);
  const jwk = await sourceJwk(key, alg, "public");
  if ("code" in jwk) {
    return fail(jwk);
  }
  const material = checkWithKid(jwk.value, alg, "public", kid);
  if ("code" in material) {
    return fail(material);
  }
  const usages = webCryptoParams(alg, material.curve);
  try {
    const cryptoKey = await crypto.subtle.importKey("jwk", material.importJwk, usages.params, true, usages.public);
    return ok(
      registerJweKey<JwePublicKey>(
        { kind: "jwe-public", alg, ...kidMember(material.kid) },
        { cryptoKey, curve: material.curve, modulusBytes: material.modulusBytes },
      ),
    );
  } catch {
    // Web Crypto rejects material it cannot use, such as a point off the curve; its message may quote it.
    return fail(INVALID_KEY);
  }
}

/**
 * Imports an untrusted private JWK, a PEM `PRIVATE KEY` (PKCS#8), an extractable private `CryptoKey`, or a
 * `CryptoKeyPair`, as a decryption key bound to one key management algorithm.
 *
 * @remarks
 * The checks are those of {@link importJwePublicKey}, plus those {@link importPrivateKey} runs on private
 * members. The two halves are proven to belong together before the key is returned: an RSA pair by encrypting and
 * decrypting a probe, an `ECDH-ES` pair by agreeing with a fresh ephemeral key from both sides.
 *
 * @returns The frozen key, or a failure with one issue. Never throws for any `key`.
 * @throws TypeError as {@link importJwePublicKey} does, or when `extractable` is not a boolean.
 */
export async function importJwePrivateKey(
  key: unknown,
  options: ImportJwePrivateKeyOptions,
): Promise<JwtResult<JwePrivateKey>> {
  const pair = await importPair(key, options, "importJwePrivateKey");
  return pair.ok ? ok(pair.value.privateKey) : pair;
}

/**
 * Imports a private key as {@link importJwePrivateKey} does, and returns it with its public half, ready to
 * publish or encrypt to.
 *
 * @returns The frozen pair, or a failure with one issue. Never throws for any `key`.
 * @throws TypeError as {@link importJwePrivateKey} does.
 */
export async function importJweKeyPair(
  key: unknown,
  options: ImportJwePrivateKeyOptions,
): Promise<JwtResult<JweKeyPair>> {
  return importPair(key, options, "importJweKeyPair");
}

async function importPair(
  key: unknown,
  options: ImportJwePrivateKeyOptions,
  name: string,
): Promise<JwtResult<JweKeyPair>> {
  const checked = requireOptions(options, PRIVATE_OPTIONS, name);
  const alg = requireAsymmetric(checked, name);
  const kid = readKid(checked, name);
  const isExtractable = readExtractable(checked, name);
  const halves = await privateHalves(key, alg, kid, isExtractable);
  if ("code" in halves) {
    return fail(halves);
  }
  if (!(await halvesMatch(alg, halves))) {
    return fail(INVALID_KEY);
  }
  return ok(registerPair(alg, halves.kid, isExtractable, halves));
}

interface Halves {
  readonly privateCryptoKey: CryptoKey;
  readonly publicCryptoKey: CryptoKey;
  readonly curve: JweCurve | undefined;
  readonly modulusBytes: number | undefined;
  readonly kid?: string | undefined;
}

function registerPair(
  alg: AsymmetricKeyManagementAlgorithm,
  kid: string | undefined,
  isExtractable: boolean,
  halves: Halves,
): JweKeyPair {
  const { privateCryptoKey, publicCryptoKey, curve, modulusBytes } = halves;
  return Object.freeze({
    privateKey: registerJweKey<JwePrivateKey>(
      { kind: "jwe-private", alg, ...kidMember(kid), extractable: isExtractable },
      { cryptoKey: privateCryptoKey, publicCryptoKey, curve, modulusBytes },
    ),
    publicKey: registerJweKey<JwePublicKey>(
      { kind: "jwe-public", alg, ...kidMember(kid) },
      { cryptoKey: publicCryptoKey, curve, modulusBytes },
    ),
  });
}

async function privateHalves(
  key: unknown,
  alg: AsymmetricKeyManagementAlgorithm,
  kid: string | undefined,
  isExtractable: boolean,
): Promise<Halves | JwtIssue> {
  const pair = readCryptoKeyPair(key);
  if (pair !== undefined) {
    return cryptoKeyPairHalves(pair, alg, kid, isExtractable);
  }
  const jwk = await sourceJwk(key, alg, "private");
  if ("code" in jwk) {
    return jwk;
  }
  const material = checkWithKid(jwk.value, alg, "private", kid);
  if ("code" in material) {
    return material;
  }
  const usages = webCryptoParams(alg, material.curve);
  const publicJwk: JsonWebKey = { ...material.importJwk };
  for (const member of PRIVATE_MEMBERS) {
    delete publicJwk[member];
  }
  try {
    return {
      privateCryptoKey: await crypto.subtle.importKey(
        "jwk",
        material.importJwk,
        usages.params,
        isExtractable,
        usages.private,
      ),
      publicCryptoKey: await crypto.subtle.importKey("jwk", publicJwk, usages.params, true, usages.public),
      curve: material.curve,
      modulusBytes: material.modulusBytes,
      kid: material.kid,
    };
  } catch {
    return INVALID_KEY;
  }
}

async function cryptoKeyPairHalves(
  pair: { readonly privateKey: CryptoKey; readonly publicKey: unknown },
  alg: AsymmetricKeyManagementAlgorithm,
  kid: string | undefined,
  isExtractable: boolean,
): Promise<Halves | JwtIssue> {
  const { privateKey, publicKey } = pair;
  if (
    privateKey.type !== "private" ||
    (isExtractable && !privateKey.extractable) ||
    !isCryptoKey(publicKey) ||
    publicKey.type !== "public"
  ) {
    return INVALID_KEY;
  }
  const purpose = purposeIssue(privateKey, alg) ?? purposeIssue(publicKey, alg);
  if (purpose !== undefined) {
    return purpose;
  }
  const jwk = await cryptoKeyJwk(publicKey, alg, "public");
  if ("code" in jwk) {
    return jwk;
  }
  const material = checkWithKid(jwk.value, alg, "public", kid);
  if ("code" in material) {
    return material;
  }
  const usages = webCryptoParams(alg, material.curve);
  if (!usages.private.every((usage) => privateKey.usages.includes(usage))) {
    return { code: "wrong_use" };
  }
  try {
    return {
      privateCryptoKey: privateKey,
      publicCryptoKey: await crypto.subtle.importKey("jwk", material.importJwk, usages.params, true, usages.public),
      curve: material.curve,
      modulusBytes: material.modulusBytes,
      kid: material.kid,
    };
  } catch {
    return INVALID_KEY;
  }
}

/** Proves the halves belong together, and that a caller's private `CryptoKey` works for `alg`. Never throws. */
async function halvesMatch(alg: AsymmetricKeyManagementAlgorithm, halves: Halves): Promise<boolean> {
  try {
    if (isRsaAlgorithm(alg)) {
      const probe = crypto.getRandomValues(new Uint8Array(16));
      const sealed = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, halves.publicCryptoKey, probe);
      const opened = new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, halves.privateCryptoKey, sealed));
      return constantTimeEqual(opened, probe);
    }
    const params = CURVE_PARAMS[halves.curve as JweCurve];
    const ephemeral = (await crypto.subtle.generateKey(params.importParams, false, ["deriveBits"])) as CryptoKeyPair;
    const bits = params.coordinateBytes * 8;
    const derive = async (privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> =>
      new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: params.importParams.name, public: publicKey } as EcdhKeyDeriveParams,
          privateKey,
          bits,
        ),
      );
    const [ours, theirs] = await Promise.all([
      derive(halves.privateCryptoKey, ephemeral.publicKey),
      derive(ephemeral.privateKey, halves.publicCryptoKey),
    ]);
    return constantTimeEqual(ours, theirs);
  } catch {
    // Web Crypto refuses a key of another algorithm or without the usage; its message may quote it.
    return false;
  }
}

function readCryptoKeyPair(key: unknown): { readonly privateKey: CryptoKey; readonly publicKey: unknown } | undefined {
  if (typeof key !== "object" || key === null || isCryptoKey(key)) {
    return undefined;
  }
  try {
    const privateKey: unknown = Object.getOwnPropertyDescriptor(key, "privateKey")?.value;
    const publicKey: unknown = Object.getOwnPropertyDescriptor(key, "publicKey")?.value;
    return isCryptoKey(privateKey) ? { privateKey, publicKey } : undefined;
  } catch {
    // A proxy's trap may throw; such a value is no key pair.
    return undefined;
  }
}

function checkWithKid(
  jwk: unknown,
  alg: AsymmetricKeyManagementAlgorithm | SymmetricKeyManagementAlgorithm,
  role: "public" | "private" | "secret",
  kid: string | undefined,
  enc?: ContentEncryptionAlgorithm,
): CheckedJweJwk | JwtIssue {
  const material = checkJweJwk(jwk, alg, role, enc);
  if ("code" in material) {
    return material;
  }
  if (material.kid !== undefined && kid !== undefined && material.kid !== kid) {
    return { code: "invalid_key", path: ["kid"] };
  }
  return material.kid === undefined && kid !== undefined ? { ...material, kid } : material;
}

type Sourced = { readonly value: unknown } | JwtIssue;

/** Reads a PEM string or a `CryptoKey` into the JWK of its material; any other value is taken as a JWK. */
async function sourceJwk(
  key: unknown,
  alg: AsymmetricKeyManagementAlgorithm,
  role: "public" | "private",
): Promise<Sourced> {
  if (typeof key === "string") {
    return pemJwk(key, alg, role);
  }
  return isCryptoKey(key) ? cryptoKeyJwk(key, alg, role) : { value: key };
}

/** The Web Crypto algorithms a PEM of `alg` may hold: one for RSA-OAEP, each curve in turn for `ECDH-ES`. */
function pemCandidates(
  alg: AsymmetricKeyManagementAlgorithm,
): readonly (RsaHashedImportParams | EcKeyImportParams | Algorithm)[] {
  return isRsaAlgorithm(alg)
    ? [{ name: "RSA-OAEP", hash: OAEP_HASH[alg] }]
    : JWE_CURVES.map((curve) => CURVE_PARAMS[curve].importParams);
}

async function pemJwk(
  pem: string,
  alg: AsymmetricKeyManagementAlgorithm,
  role: "public" | "private",
): Promise<Sourced> {
  const der = readPemDer(pem, role);
  if (!der.ok) {
    return der.issue;
  }
  const format = role === "public" ? "spki" : "pkcs8";
  const usages: KeyUsage[] = isRsaAlgorithm(alg)
    ? [role === "public" ? "encrypt" : "decrypt"]
    : role === "public"
      ? []
      : ["deriveBits"];
  // At most four imports: a PEM names its curve inside the DER, so each wrong curve fails fast.
  for (const params of pemCandidates(alg)) {
    try {
      // Tried in turn by design: only one can succeed.
      // oxlint-disable-next-line no-await-in-loop
      const cryptoKey = await crypto.subtle.importKey(format, der.value, params, true, usages);
      // oxlint-disable-next-line no-await-in-loop
      return { value: await materialJwk(cryptoKey) };
    } catch {
      // Web Crypto rejects DER of another type or curve; its message may quote it.
    }
  }
  return INVALID_KEY;
}

async function cryptoKeyJwk(
  cryptoKey: CryptoKey,
  alg: AsymmetricKeyManagementAlgorithm,
  role: "public" | "private",
): Promise<Sourced> {
  if (cryptoKey.type === "private" && role === "public") {
    return { code: "unexpected_private_key" };
  }
  if (cryptoKey.type !== role) {
    return INVALID_KEY;
  }
  const purpose = purposeIssue(cryptoKey, alg);
  if (purpose !== undefined) {
    return purpose;
  }
  if (!cryptoKey.extractable) {
    return INVALID_KEY;
  }
  try {
    return { value: await materialJwk(cryptoKey) };
  } catch {
    return INVALID_KEY;
  }
}

/**
 * Refuses a `CryptoKey` made for another purpose: a signing key, or RSA-OAEP with another hash, is `alg_mismatch`,
 * as an RSA-OAEP key given to {@link importPublicKey} is.
 */
function purposeIssue(cryptoKey: CryptoKey, alg: AsymmetricKeyManagementAlgorithm): JwtIssue | undefined {
  const algorithm = cryptoKey.algorithm as Partial<RsaHashedKeyAlgorithm & EcKeyAlgorithm>;
  if (isRsaAlgorithm(alg)) {
    if (algorithm.name !== "RSA-OAEP" || algorithm.hash?.name !== OAEP_HASH[alg]) {
      return { code: "alg_mismatch" };
    }
    return cryptoKey.type === "public" && !cryptoKey.usages.includes("encrypt") ? { code: "wrong_use" } : undefined;
  }
  return algorithm.name === "ECDH" || algorithm.name === "X25519" ? undefined : { code: "alg_mismatch" };
}

/**
 * Exports a key as the JWK of its material alone, with `d` padded to the curve's length: WebKit drops leading
 * zero bytes of `d` on export, as `exportWebCryptoJwk` records for the JWS curves.
 */
async function materialJwk(cryptoKey: CryptoKey): Promise<Record<string, unknown>> {
  const exported = await crypto.subtle.exportKey("jwk", cryptoKey);
  const jwk: Record<string, unknown> = { ...padScalar(exported) };
  for (const member of ["alg", "ext", "key_ops", "use"]) {
    delete jwk[member];
  }
  return jwk;
}

function padScalar(exported: JsonWebKey): JsonWebKey {
  const curve = exported.crv;
  const scalar = typeof exported.d === "string" ? decodeBase64Url(exported.d) : undefined;
  if (!isJweCurve(curve) || scalar === undefined) {
    return exported;
  }
  const { coordinateBytes } = CURVE_PARAMS[curve];
  if (scalar.length >= coordinateBytes) {
    return exported;
  }
  const padded = new Uint8Array(coordinateBytes);
  padded.set(scalar, coordinateBytes - scalar.length);
  return { ...exported, d: encodeBase64Url(padded) };
}

/**
 * Imports an untrusted secret for `dir`, `A128KW` or `A256KW`: raw bytes, an `oct` JWK, or a Web Crypto
 * `CryptoKey` (an AES-KW key for `A*KW`, an AES-GCM key for `dir` with an AES-GCM `enc`).
 *
 * @remarks
 * The secret must be exactly as long as its algorithm's key: 16 bytes for `A128KW`, 32 for `A256KW`, and for
 * `dir` the content key length of `enc` (16 for `A128GCM`, 32 for `A256GCM` and `A128CBC-HS256`, 64 for
 * `A256CBC-HS512`). Shorter is `weak_key`, longer `invalid_key`. A JWK's `use`, when present, must be `enc`.
 *
 * @returns The frozen secret, or a failure with one issue. Never throws for any `input`.
 * @throws TypeError when `options` is not an object, has a member that is not an option, `alg` is not `dir`,
 * `A128KW` or `A256KW`, `enc` is missing or unsupported for `dir` or given for another `alg`, `kid` is not a
 * string, or `extractable` is not a boolean.
 */
export async function importJweSecretKey(
  input: Uint8Array | ArrayBuffer | ArrayBufferView | CryptoKey | object,
  options: ImportJweSecretKeyOptions,
): Promise<JwtResult<JweSecretKey>> {
  const name = "importJweSecretKey";
  const checked = requireOptions(options, SECRET_OPTIONS, name);
  const { alg, enc } = requireSymmetric(checked, name);
  const kid = readKid(checked, name);
  const isExtractable = readExtractable(checked, name);
  const length = secretLength(alg, enc);
  if (isCryptoKey(input)) {
    return secretCryptoKey(input, alg, enc, kid, isExtractable, length);
  }
  const isBytes = isUint8Array(input) || ArrayBuffer.isView(input) || isArrayBuffer(input);
  let bytes = isBytes ? copyBytes(input) : undefined;
  let secretKid = kid;
  if (isBytes) {
    if (bytes === undefined) {
      return fail(INVALID_KEY);
    }
    if (bytes.length < length) {
      return fail({ code: "weak_key", params: { minimum: length } });
    }
    if (bytes.length > length) {
      return fail({ code: "invalid_key", params: { maximum: length } });
    }
  } else {
    const material = checkWithKid(input, alg, "secret", kid, enc);
    if ("code" in material) {
      return fail(material);
    }
    bytes = material.secret as Uint8Array<ArrayBuffer>;
    secretKid = material.kid;
  }
  return ok(await secretKeyOf(alg, enc, secretKid, isExtractable, bytes));
}

function secretCryptoKey(
  cryptoKey: CryptoKey,
  alg: SymmetricKeyManagementAlgorithm,
  enc: ContentEncryptionAlgorithm | undefined,
  kid: string | undefined,
  isExtractable: boolean,
  length: number,
): JwtResult<JweSecretKey> {
  const algorithm = cryptoKey.algorithm as Partial<AesKeyAlgorithm>;
  const isGcm = enc !== undefined && CONTENT_PARAMS[enc].hash === undefined;
  const [expected, usages] =
    alg === "dir" ? ["AES-GCM", ["encrypt", "decrypt"] as const] : ["AES-KW", ["wrapKey", "unwrapKey"] as const];
  if (
    cryptoKey.type !== "secret" ||
    (alg === "dir" && !isGcm) ||
    algorithm.name !== expected ||
    !usages.every((usage) => cryptoKey.usages.includes(usage)) ||
    (isExtractable && !cryptoKey.extractable)
  ) {
    return fail(INVALID_KEY);
  }
  if ((algorithm.length ?? 0) !== length * 8) {
    return fail((algorithm.length ?? 0) < length * 8 ? { code: "weak_key", params: { minimum: length } } : INVALID_KEY);
  }
  const entry: JweKeyEntry =
    alg === "dir" ? { contentKey: Object.freeze({ mode: "gcm", key: cryptoKey }) } : { cryptoKey };
  return ok(
    registerJweKey<JweSecretKey>(
      { kind: "jwe-secret", alg, ...(enc === undefined ? {} : { enc }), ...kidMember(kid), extractable: isExtractable },
      entry,
    ),
  );
}

/**
 * Returns the public half of a JWE private key, for publishing or encrypting to. The same object each call for a
 * key that came with its pair is not promised; the key works the same either way.
 *
 * @throws TypeError when `key` is not a JWE private key created by this package.
 */
export function getJwePublicKey(key: JwePrivateKey): JwePublicKey {
  const entry = getJweKeyEntry(key, "getJwePublicKey");
  if (key.kind !== "jwe-private" || entry.publicCryptoKey === undefined) {
    throw new TypeError("getJwePublicKey: key must be a JWE private key.");
  }
  return registerJweKey<JwePublicKey>(
    { kind: "jwe-public", alg: key.alg, ...kidMember(key.kid) },
    { cryptoKey: entry.publicCryptoKey, curve: entry.curve, modulusBytes: entry.modulusBytes },
  );
}

const PUBLIC_MEMBERS = ["crv", "x", "y", "n", "e"] as const;
const ALL_PRIVATE_MEMBERS = ["crv", "x", "y", "n", "e", "d", "p", "q", "dp", "dq", "qi"] as const;

/**
 * Exports a JWE public key as a frozen JWK with `alg`, `use: "enc"` and `kid`, ready for a JWKS a sender encrypts
 * to.
 *
 * @throws TypeError when `key` is not a JWE public key created by this package.
 */
export async function exportJwePublicJwk(key: JwePublicKey): Promise<JweJwk> {
  const entry = getJweKeyEntry(key, "exportJwePublicJwk");
  if (key.kind !== "jwe-public") {
    throw new TypeError(
      "exportJwePublicJwk: key must be a JWE public key; export a private key's public half with getJwePublicKey(key).",
    );
  }
  return toJwk(key, await materialJwk(entry.cryptoKey as CryptoKey), PUBLIC_MEMBERS);
}

/**
 * Exports a JWE private key as a frozen JWK, private members included.
 *
 * @throws TypeError when `key` is not a JWE private key created by this package, or was not made extractable.
 */
export async function exportJwePrivateJwk(key: JwePrivateKey): Promise<JweJwk> {
  const entry = getJweKeyEntry(key, "exportJwePrivateJwk");
  if (key.kind !== "jwe-private") {
    throw new TypeError("exportJwePrivateJwk: key must be a JWE private key.");
  }
  if (!key.extractable) {
    throw new TypeError("exportJwePrivateJwk: the key was not created with extractable: true.");
  }
  return toJwk(key, await materialJwk(entry.cryptoKey as CryptoKey), ALL_PRIVATE_MEMBERS);
}

/**
 * Exports a JWE secret as a frozen `oct` JWK with `alg` and `use: "enc"`.
 *
 * @throws TypeError when `key` is not a JWE secret created by this package, or was not made extractable.
 */
export async function exportJweSecretJwk(key: JweSecretKey): Promise<JweJwk> {
  const entry = getJweKeyEntry(key, "exportJweSecretJwk");
  if (key.kind !== "jwe-secret") {
    throw new TypeError("exportJweSecretJwk: key must be a JWE secret key.");
  }
  if (!key.extractable) {
    throw new TypeError("exportJweSecretJwk: the key was not created with extractable: true.");
  }
  const bytes =
    entry.contentKey === undefined
      ? new Uint8Array(await crypto.subtle.exportKey("raw", entry.cryptoKey as CryptoKey))
      : await exportContentKey(entry.contentKey);
  const jwk: Record<string, string> = { kty: "oct", alg: key.alg, use: "enc" };
  if (key.kid !== undefined) {
    jwk.kid = key.kid;
  }
  jwk.k = encodeBase64Url(bytes);
  return Object.freeze(jwk) as unknown as JweJwk;
}

function toJwk(
  key: JwePublicKey | JwePrivateKey,
  exported: Record<string, unknown>,
  members: readonly string[],
): JweJwk {
  const jwk: Record<string, string> = { kty: exported.kty as string, alg: key.alg, use: "enc" };
  if (key.kid !== undefined) {
    jwk.kid = key.kid;
  }
  for (const member of members) {
    const value = exported[member];
    if (typeof value === "string") {
      jwk[member] = value;
    }
  }
  return Object.freeze(jwk) as unknown as JweJwk;
}

/** RFC 7638 §3.2: the required members of each key type, in lexicographic order. */
const THUMBPRINT_MEMBERS: Readonly<Record<string, readonly string[]>> = {
  EC: ["crv", "kty", "x", "y"],
  OKP: ["crv", "kty", "x"],
  RSA: ["e", "kty", "n"],
};

/**
 * The RFC 7638 thumbprint of a JWE public or private key, by its public half. `jwkThumbprint` calls this for a
 * JWE key.
 *
 * @throws TypeError when `key` is not a JWE public or private key created by this package.
 */
export async function jweKeyThumbprint(key: JwePublicKey | JwePrivateKey): Promise<string> {
  const entry = getJweKeyEntry(key, "jwkThumbprint");
  const publicCryptoKey = key.kind === "jwe-private" ? entry.publicCryptoKey : entry.cryptoKey;
  if ((key.kind !== "jwe-public" && key.kind !== "jwe-private") || publicCryptoKey === undefined) {
    throw new TypeError("jwkThumbprint: key must be a public or private key created by this package.");
  }
  return publicThumbprint(publicCryptoKey, key.alg);
}

async function publicThumbprint(publicCryptoKey: CryptoKey, alg: AsymmetricKeyManagementAlgorithm): Promise<string> {
  const exported = (await crypto.subtle.exportKey("jwk", publicCryptoKey)) as Record<string, unknown>;
  const kty = isEcdhAlgorithm(alg) ? (exported.kty as string) : "RSA";
  const material: Record<string, unknown> = { ...exported, kty };
  const canonical = JSON.stringify(
    Object.fromEntries((THUMBPRINT_MEMBERS[kty] as readonly string[]).map((name) => [name, material[name]])),
  );
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encodeUtf8(canonical))));
}
