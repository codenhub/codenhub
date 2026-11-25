import { fail, ok } from "../core/result";
import type { JwtIssue, JwtResult } from "../core/types";
import { copyBytes, encodeBase64Url, encodeUtf8, isArrayBuffer, isUint8Array } from "../encoding";
import { isCryptoKey, padPrivateScalar, withoutExportMetadata } from "../keys/exported-jwk";
import { ownMember, readExtractable, readKid, requireOptions } from "../keys/options";
import { pemKeyIssue, readKeyType, readPemDer, writePem } from "../keys/pem";
import { kidMember } from "../keys/registry";
import {
  generatePair,
  OKP_GENERATION_RETRIES,
  PAIR_PRIVATE_MEMBERS,
  readCryptoKeyPair,
  RSA_PUBLIC_EXPONENT,
} from "../keys/web-crypto";
import {
  ASYMMETRIC_KEY_MANAGEMENT_ALGORITHMS,
  CONTENT_ENCRYPTION_ALGORITHMS,
  CONTENT_PARAMS,
  CURVE_PARAMS,
  isAsymmetricKeyManagementAlgorithm,
  isContentEncryptionAlgorithm,
  isEcdhAlgorithm,
  isGcmKeyWrapAlgorithm,
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
const THUMBPRINT_KID = "thumbprint";
/** Retries after an `OperationError` from X25519 generation, as for Ed25519 (see `generateKeyPair`). */
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

/**
 * Generates a random secret for `dir`, `A128KW`, `A256KW`, `A128GCMKW` or `A256GCMKW`, exactly as long as its
 * algorithm needs: 16 or 32 bytes to wrap with, or the content key length of `enc` for `dir`.
 *
 * @returns The frozen secret.
 * @throws TypeError when `options` is not an object, has a member that is not an option, `alg` is not a symmetric
 * key management algorithm, `enc` is missing or unsupported for `dir` or given for another `alg`, `kid` is not a
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

/**
 * The Web Crypto algorithm and usages a secret of `alg` is held as: AES-GCM for `dir` and the GCM key wraps, AES-KW
 * for the others.
 */
function wrapKeyParams(alg: SymmetricKeyManagementAlgorithm): {
  readonly name: "AES-GCM" | "AES-KW";
  readonly usages: readonly KeyUsage[];
} {
  return alg === "dir" || isGcmKeyWrapAlgorithm(alg)
    ? { name: "AES-GCM", usages: ["encrypt", "decrypt"] }
    : { name: "AES-KW", usages: ["wrapKey", "unwrapKey"] };
}

async function secretKeyOf(
  alg: SymmetricKeyManagementAlgorithm,
  enc: ContentEncryptionAlgorithm | undefined,
  kid: string | undefined,
  isExtractable: boolean,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<JweSecretKey> {
  const { name, usages } = wrapKeyParams(alg);
  const entry: JweKeyEntry =
    alg === "dir"
      ? { contentKey: await importContentKey(enc as ContentEncryptionAlgorithm, bytes, isExtractable) }
      : { cryptoKey: await crypto.subtle.importKey("raw", bytes, name, isExtractable, [...usages]) };
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
 * `enc`; `key_ops`, when present, must hold only encryption operations and one a public key performs, except that
 * an empty `key_ops` on an `EC` or `OKP` key, which is how Web Crypto exports an ECDH or X25519 public key, is
 * taken as absent. RSA moduli
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
    if (material.curve === "X25519" && !(await agreesWithFreshKey(cryptoKey, material.curve))) {
      return fail(INVALID_KEY);
    }
    return ok(
      registerJweKey<JwePublicKey>(
        { kind: "jwe-public", alg, ...kidMember(material.kid) },
        { cryptoKey, curve: material.curve, modulusBytes: material.modulusBytes },
      ),
    );
  } catch {
    // Web Crypto rejects material it cannot use; its message may quote it.
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
  for (const member of PAIR_PRIVATE_MEMBERS) {
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
    const curve = halves.curve as JweCurve;
    const ephemeral = await ephemeralPair(curve);
    const [ours, theirs] = await Promise.all([
      agree(curve, halves.privateCryptoKey, ephemeral.publicKey),
      agree(curve, ephemeral.privateKey, halves.publicCryptoKey),
    ]);
    return !isAllZero(ours) && constantTimeEqual(ours, theirs);
  } catch {
    // Web Crypto refuses a key of another algorithm or without the usage; its message may quote it.
    return false;
  }
}

/**
 * Whether a recipient's public key agrees on a non-zero secret with a fresh ephemeral key, as every sender's will
 * have to. A low-order X25519 point fails: Web Crypto refuses the agreement or gives an all-zero secret (RFC 7748
 * §6.1), and `encrypt` would fail the same way on every token. NIST curves need no such check: the JWK checks
 * refuse a point off the curve, and their order is prime. Never throws.
 */
async function agreesWithFreshKey(publicKey: CryptoKey, curve: JweCurve): Promise<boolean> {
  try {
    const ephemeral = await ephemeralPair(curve);
    return !isAllZero(await agree(curve, ephemeral.privateKey, publicKey));
  } catch {
    // Web Crypto refuses a low-order point on some engines; its message may quote it.
    return false;
  }
}

async function ephemeralPair(curve: JweCurve): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(CURVE_PARAMS[curve].importParams, false, ["deriveBits"])) as CryptoKeyPair;
}

async function agree(curve: JweCurve, privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> {
  const params = CURVE_PARAMS[curve];
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: params.importParams.name, public: publicKey } as EcdhKeyDeriveParams,
      privateKey,
      params.coordinateBytes * 8,
    ),
  );
}

function isAllZero(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte === 0);
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
  // A key of another type or curve is unsupported_key, as for a signing key's PEM, not a bare invalid_key.
  const read = readKeyType(der.value, format);
  const typeIssue = isRsaAlgorithm(alg)
    ? pemKeyIssue(read, "RSA", undefined)
    : read?.kty === "OKP"
      ? pemKeyIssue(read, "OKP", ["X25519"])
      : pemKeyIssue(read, "EC", ["P-256", "P-384", "P-521"]);
  if (typeIssue !== undefined) {
    return typeIssue;
  }
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
  const curve = exported.crv;
  return withoutExportMetadata(
    padPrivateScalar(exported, isJweCurve(curve) ? CURVE_PARAMS[curve].coordinateBytes : undefined),
  );
}

/**
 * Imports an untrusted secret for `dir`, `A128KW`, `A256KW`, `A128GCMKW` or `A256GCMKW`: raw bytes, an `oct`
 * JWK, or a Web Crypto `CryptoKey` (an AES-KW key for `A*KW`, an AES-GCM key for `A*GCMKW`, and for `dir` with an
 * AES-GCM `enc`).
 *
 * @remarks
 * The secret must be exactly as long as its algorithm's key: 16 bytes for `A128KW` and `A128GCMKW`, 32 for
 * `A256KW` and `A256GCMKW`, and for `dir` the content key length of `enc` (16 for `A128GCM`, 32 for `A256GCM` and
 * `A128CBC-HS256`, 64 for `A256CBC-HS512`). Shorter is `weak_key`, longer `invalid_key`. A JWK's `use`, when
 * present, must be `enc`.
 *
 * @returns The frozen secret, or a failure with one issue. Never throws for any `input`.
 * @throws TypeError when `options` is not an object, has a member that is not an option, `alg` is not a symmetric
 * key management algorithm, `enc` is missing or unsupported for `dir` or given for another `alg`, `kid` is not a
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
  const { name: expected, usages } = wrapKeyParams(alg);
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

/**
 * Exports a JWE public key as a PEM `PUBLIC KEY` block (SPKI, RFC 7468 §13), for tools and services that take PEM
 * rather than a JWK. The PEM carries the key material only, without `alg` or `kid`.
 *
 * @example
 * ```ts
 * const pem = await exportJwePublicPem(getJwePublicKey(privateKey));
 * ```
 *
 * @param key - A public key from {@link importJwePublicKey}, {@link importJweKeyPair} or {@link generateJweKeyPair}.
 * @returns The PEM text: the base64 in 64-character lines, with LF line endings and a final line break.
 * @throws TypeError when `key` is not a JWE public key created by this package. For a private key, the message
 * points to {@link getJwePublicKey}.
 */
export async function exportJwePublicPem(key: JwePublicKey): Promise<string> {
  const entry = getJweKeyEntry(key, "exportJwePublicPem");
  if (key.kind !== "jwe-public") {
    throw new TypeError(
      "exportJwePublicPem: key must be a JWE public key; export a private key's public half with getJwePublicKey(key).",
    );
  }
  return writePem("PUBLIC KEY", new Uint8Array(await crypto.subtle.exportKey("spki", entry.cryptoKey as CryptoKey)));
}

/**
 * Exports a JWE private key as a PEM `PRIVATE KEY` block (PKCS#8, RFC 7468 §10), unencrypted, without `alg` or
 * `kid`. Handle the result as a secret.
 *
 * @param key - A private key imported or generated with `extractable: true`.
 * @returns The PEM text: the base64 in 64-character lines, with LF line endings and a final line break.
 * @throws TypeError when `key` is not a JWE private key created by this package, or was not made extractable. A
 * secret key has no PEM form; export it with {@link exportJweSecretJwk}.
 */
export async function exportJwePrivatePem(key: JwePrivateKey): Promise<string> {
  const entry = getJweKeyEntry(key, "exportJwePrivatePem");
  if (key.kind !== "jwe-private") {
    throw new TypeError("exportJwePrivatePem: key must be a JWE private key.");
  }
  if (!key.extractable) {
    throw new TypeError("exportJwePrivatePem: the key was not created with extractable: true.");
  }
  return writePem("PRIVATE KEY", new Uint8Array(await crypto.subtle.exportKey("pkcs8", entry.cryptoKey as CryptoKey)));
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

async function publicThumbprint(publicCryptoKey: CryptoKey, alg: AsymmetricKeyManagementAlgorithm): Promise<string> {
  const exported = (await crypto.subtle.exportKey("jwk", publicCryptoKey)) as Record<string, unknown>;
  const kty = isEcdhAlgorithm(alg) ? (exported.kty as string) : "RSA";
  const material: Record<string, unknown> = { ...exported, kty };
  const canonical = JSON.stringify(
    Object.fromEntries((THUMBPRINT_MEMBERS[kty] as readonly string[]).map((name) => [name, material[name]])),
  );
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encodeUtf8(canonical))));
}
