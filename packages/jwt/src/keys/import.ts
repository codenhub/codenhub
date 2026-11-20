import { fail, ok } from "../core";
import type {
  AsymmetricAlgorithm,
  JwsAlgorithm,
  JwtIssue,
  JwtResult,
  PrivateKey,
  PublicKey,
  SecretKey,
  SymmetricAlgorithm,
} from "../core/types";
import { copyBytes, isArrayBuffer, isUint8Array } from "../encoding";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportMaterialJwk, isCryptoKey } from "./exported-jwk";
import type { KeyPair } from "./generate";
import { checkJwk, type KeyRole } from "./jwk";
import { readExtractable, readKid, requireAsymmetricAlg, requireOptions, requireSymmetricAlg } from "./options";
import { pemToJwk } from "./pem";
import { kidMember, registerKey } from "./registry";

/** How {@link importPublicKey} binds the imported key. */
export interface ImportPublicKeyOptions {
  /** The one algorithm the key will verify with. The key's type and curve must fit it. */
  readonly alg: AsymmetricAlgorithm;
  /**
   * Key identifier. A PEM key and a `CryptoKey` have no place for one; a JWK without a `kid` takes this one,
   * and a JWK whose own `kid` differs is `invalid_key` at `["kid"]`.
   *
   * @defaultValue no `kid`
   */
  readonly kid?: string;
}

/** How {@link importPrivateKey} binds the imported key. */
export interface ImportPrivateKeyOptions {
  /** The one algorithm the key will sign with. The key's type and curve must fit it. */
  readonly alg: AsymmetricAlgorithm;
  /**
   * Key identifier. A PEM key and a `CryptoKey` have no place for one; a JWK without a `kid` takes this one,
   * and a JWK whose own `kid` differs is `invalid_key` at `["kid"]`.
   *
   * @defaultValue no `kid`
   */
  readonly kid?: string;
  /**
   * Whether {@link exportPrivateJwk} may later export the key's material.
   *
   * @defaultValue false
   */
  readonly extractable?: boolean;
}

const PUBLIC_KEY_OPTIONS: Readonly<Record<keyof ImportPublicKeyOptions, true>> = { alg: true, kid: true };
const PRIVATE_KEY_OPTIONS: Readonly<Record<keyof ImportPrivateKeyOptions, true>> = {
  alg: true,
  kid: true,
  extractable: true,
};

/** How {@link importSecretKey} binds the imported secret. */
export interface ImportSecretKeyOptions {
  /** The one algorithm the secret will sign and verify with. */
  readonly alg: SymmetricAlgorithm;
  /**
   * Key identifier. Raw bytes and a `CryptoKey` have no place for one; a JWK without a `kid` takes this one, and
   * a JWK whose own `kid` differs is `invalid_key` at `["kid"]`.
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

const SECRET_KEY_OPTIONS: Readonly<Record<keyof ImportSecretKeyOptions, true>> = {
  alg: true,
  kid: true,
  extractable: true,
};

const USAGES: Readonly<Record<KeyRole, KeyUsage[]>> = {
  public: ["verify"],
  private: ["sign"],
  secret: ["sign", "verify"],
};

/**
 * Imports an untrusted public JWK, a PEM `PUBLIC KEY` (SPKI) or `RSA PUBLIC KEY` (PKCS#1), the public key of
 * a PEM `CERTIFICATE` (X.509), or a public Web Crypto `CryptoKey`, as a verification key bound to one algorithm.
 *
 * @remarks
 * A `CryptoKey` must be an extractable public key, as every public key Web Crypto generates is. It is
 * exported and checked as a JWK; a private one is `unexpected_private_key`, any other `invalid_key`. Its Web Crypto
 * algorithm and hash must be the ones `alg` signs with, or it is `alg_mismatch`, so an `RSA-OAEP` or `ECDH` key
 * is refused; and it must allow `verify`, or it is `wrong_use`.
 *
 * A PEM string is read into the JWK of its material, and every check below runs on that JWK. It must be
 * one block of at most 16384 characters, with only whitespace around it and any whitespace inside it, so a
 * PEM flattened onto one line imports too. A key of another type or curve than `alg` is `unsupported_key`, and
 * a private key block is `unexpected_private_key`; anything else is `invalid_key`, with `{ reason: "encrypted" }`
 * for an encrypted key and `{ reason: "unsupported_format" }` for a label or form this package does not read. Only a certificate's key is read: its validity,
 * issuer, extensions and signature are not checked, so trust it as you would a bare public key.
 *
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
 * @param key - The JWK, typically parsed from JSON, a PEM string, or a `CryptoKey`. Any value is accepted.
 * @param options - The algorithm to bind the key to, and its `kid`.
 * @returns The frozen key, or a failure with one issue: `invalid_key` for a non-object, a missing or
 * ill-typed member, invalid base64url, wrong coordinate lengths, or material Web Crypto rejects (such
 * as a point not on the curve); `unsupported_key` for a `kty`/`crv` that does not fit `alg` or a
 * modulus over 8192 bits; `alg_mismatch` for a JWK `alg` naming another algorithm; `wrong_use` for a
 * `use` other than `sig`, or `key_ops` without `verify` or with an operation other than `sign` and `verify`; `unexpected_private_key` for any private
 * member; `weak_key` for a modulus under 2048 bits. Issues never contain key values. Never throws for
 * any `key`.
 * @throws TypeError when `options` is not an object, has a member that is not an option, `options.alg` is
 * not an asymmetric algorithm, or `options.kid` is not a string.
 */
export async function importPublicKey(key: unknown, options: ImportPublicKeyOptions): Promise<JwtResult<PublicKey>> {
  const checked = requireOptions(options, PUBLIC_KEY_OPTIONS, "importPublicKey");
  const alg = requireAsymmetricAlg(checked, "importPublicKey");
  const kid = readKid(checked, "importPublicKey");
  const jwk = await sourceJwk(key, alg, "public", kid);
  if (!jwk.ok) {
    return fail(jwk.issue);
  }
  return importJwk(jwk.value, { alg, role: "public", isExtractable: true, kid }, (kid) => ({
    kind: "public",
    alg,
    ...kidMember(kid),
  }));
}

/**
 * Imports an untrusted private JWK, a PEM `PRIVATE KEY` (PKCS#8), `RSA PRIVATE KEY` (PKCS#1) or `EC PRIVATE KEY`
 * (SEC 1), or a Web Crypto key pair, as a signing key bound to one algorithm.
 *
 * @remarks
 * The same checks as {@link importPublicKey} apply, except that private members are required: `d`
 * for EC and OKP keys, and `d`, `p`, `q`, `dp`, `dq` and `qi` for RSA keys. `key_ops`, when present,
 * must include `sign`. A PEM string is read as for {@link importPublicKey}, and must be a private key block; an
 * `EC PRIVATE KEY` must name its curve. As for
 * {@link importKeyPair}, the key's public members must belong to it, which a probe signature proves.
 * A `CryptoKey` is read as {@link importKeyPair} describes. {@link getPublicKey} gives the public half.
 *
 * @example
 * ```ts
 * const result = await importPrivateKey(env.SIGNING_KEY_PEM, { alg: "RS256", kid: "2026-11" });
 * ```
 *
 * @param key - The JWK, typically parsed from JSON, a PEM string, a `CryptoKeyPair`, or an extractable
 * private `CryptoKey`. Any value is accepted.
 * @param options - The algorithm to bind the key to, its `kid`, and whether it
 * may be exported again.
 * @returns The frozen key, or a failure with one issue: `invalid_key`, `unsupported_key` (also for
 * multi-prime RSA keys with `oth`), `alg_mismatch`, `wrong_use` or `weak_key`, as described for
 * {@link importPublicKey}, and `invalid_key` without a path when the public members do not belong to the
 * private key, at `["d"]` when an RSA key's `d` does not agree with `p`, `q`, `dp` and `dq`, or at `["qi"]` when
 * its `qi` is not the inverse of `q` modulo `p`. Issues never contain key values. Never throws for any `key`.
 * @throws TypeError when `options` is not an object, has a member that is not an option, `options.alg` is
 * not an asymmetric algorithm, `options.kid` is not a string, or `options.extractable` is not a boolean.
 */
export async function importPrivateKey(key: unknown, options: ImportPrivateKeyOptions): Promise<JwtResult<PrivateKey>> {
  const pair = await importPair(key, options, "importPrivateKey");
  return pair.ok ? ok(pair.value.privateKey) : pair;
}

/**
 * Imports an untrusted private JWK, a PEM private key as {@link importPrivateKey} reads it, or a Web Crypto key pair, as a key pair
 * bound to one algorithm: the private key, and the public key taken from the same key's public members.
 *
 * @remarks
 * The checks of {@link importPrivateKey} apply. The pair is proved to match before it is returned: the
 * private key signs a fixed message and the public key must verify it, so a JWK whose public members
 * belong to another key fails. Use it to load a signing key stored with {@link exportPrivateJwk}, and
 * publish `exportPublicJwk(pair.publicKey)` without storing a second JWK.
 *
 * A `CryptoKeyPair`, such as one `crypto.subtle.generateKey` made non-extractable and an application kept in
 * IndexedDB, is used as it is: its private `CryptoKey` is kept, never exported, so it stays non-extractable;
 * its public key must be extractable and passes the JWK checks; and the probe signature proves the private
 * key fits `alg`, its hash and padding included. A `CryptoKey` of another Web Crypto algorithm or hash than `alg`
 * signs with, such as an `RSA-OAEP` or `ECDH` key, is `alg_mismatch`. With `extractable: true`, the private `CryptoKey` must be
 * extractable. An extractable private `CryptoKey` given alone is exported and read as a JWK; a
 * non-extractable one alone is `invalid_key`, since its public half cannot be read from it.
 *
 * @example
 * ```ts
 * const result = await importKeyPair(storedPrivateJwk, { alg: "ES256" });
 * if (!result.ok) throw new Error("The signing key could not be imported.");
 * const { privateKey, publicKey } = result.value;
 * ```
 *
 * @param key - The private JWK, typically parsed from JSON, a PEM string, a `CryptoKeyPair`, or an extractable
 * private `CryptoKey`. Any value is accepted.
 * @param options - The algorithm to bind both keys to, their `kid`, and whether the
 * private key may be exported again.
 * @returns The frozen pair, both keys carrying the key's `kid`, or a failure with one issue: the issues
 * {@link importPrivateKey} returns, and `invalid_key` without a path when the public members do not
 * belong to the private key. Issues never contain key values. Never throws for any `key`.
 * @throws TypeError when `options` is not an object, has a member that is not an option, `options.alg` is
 * not an asymmetric algorithm, `options.kid` is not a string, or `options.extractable` is not a boolean.
 */
export async function importKeyPair(key: unknown, options: ImportPrivateKeyOptions): Promise<JwtResult<KeyPair>> {
  return importPair(key, options, "importKeyPair");
}

/** Imports a private key and the public key of its public members, proven to belong together. */
async function importPair(
  key: unknown,
  options: ImportPrivateKeyOptions,
  functionName: string,
): Promise<JwtResult<KeyPair>> {
  const checked = requireOptions(options, PRIVATE_KEY_OPTIONS, functionName);
  const alg = requireAsymmetricAlg(checked, functionName);
  const isExtractable = readExtractable(checked, functionName);
  const kid = readKid(checked, functionName);
  const cryptoKeyPair = readCryptoKeyPair(key);
  const halves =
    cryptoKeyPair === undefined
      ? await jwkHalves(key, alg, kid, isExtractable)
      : await cryptoKeyPairHalves(cryptoKeyPair, alg, kid, isExtractable);
  if ("code" in halves) {
    return fail(halves);
  }
  const params = ALGORITHM_PARAMS[alg];
  // Signed once to prove the two halves belong together, and that a caller's private CryptoKey fits `alg`,
  // its hash included. Built here, not at module level, so bundles that never call this function can drop it.
  const probe = new Uint8Array([0x6a, 0x77, 0x74]);
  try {
    const signature = await crypto.subtle.sign(params.signParams, halves.privateCryptoKey, probe);
    if (!(await crypto.subtle.verify(params.signParams, halves.publicCryptoKey, signature, probe))) {
      return fail({ code: "invalid_key" });
    }
  } catch {
    // Web Crypto refuses a key of another algorithm or without the sign usage; its message may quote it.
    return fail({ code: "invalid_key" });
  }
  const { privateCryptoKey, publicCryptoKey, signatureLength } = halves;
  return ok(
    Object.freeze({
      privateKey: registerKey<PrivateKey>(
        { kind: "private", alg, ...kidMember(halves.kid), extractable: isExtractable },
        { signatureLength, cryptoKey: privateCryptoKey, publicCryptoKey },
      ),
      publicKey: registerKey<PublicKey>(
        { kind: "public", alg, ...kidMember(halves.kid) },
        { signatureLength, cryptoKey: publicCryptoKey },
      ),
    }),
  );
}

/** The two halves of a private key, not yet proven to belong together. */
interface KeyHalves {
  readonly privateCryptoKey: CryptoKey;
  readonly publicCryptoKey: CryptoKey;
  readonly signatureLength: number;
  readonly kid: string | undefined;
}

/** The halves of a private JWK, a PEM `PRIVATE KEY` or an extractable private `CryptoKey`, imported anew. */
async function jwkHalves(
  key: unknown,
  alg: AsymmetricAlgorithm,
  kid: string | undefined,
  isExtractable: boolean,
): Promise<KeyHalves | JwtIssue> {
  const jwk = await sourceJwk(key, alg, "private", kid);
  if (!jwk.ok) {
    return jwk.issue;
  }
  const material = checkJwk(jwk.value, alg, "private");
  if ("code" in material) {
    return material;
  }
  if (isKidConflict(material.kid, kid)) {
    return { code: "invalid_key", path: ["kid"] };
  }
  const { importParams } = ALGORITHM_PARAMS[alg];
  const publicJwk: JsonWebKey = { ...material.importJwk };
  for (const name of PRIVATE_MEMBERS) {
    delete publicJwk[name];
  }
  try {
    return {
      privateCryptoKey: await crypto.subtle.importKey("jwk", material.importJwk, importParams, isExtractable, ["sign"]),
      publicCryptoKey: await crypto.subtle.importKey("jwk", publicJwk, importParams, true, ["verify"]),
      signatureLength: material.signatureLength,
      kid: material.kid ?? kid,
    };
  } catch {
    // Web Crypto rejects material it cannot use, such as a point off the curve; its message may quote it.
    return { code: "invalid_key" };
  }
}

/**
 * The halves of a Web Crypto key pair. The private `CryptoKey` is kept as given, so a non-extractable key
 * stays so; the public one runs through the JWK checks, which bind its type, curve and size to `alg`.
 */
async function cryptoKeyPairHalves(
  pair: CryptoKeyPairInput,
  alg: AsymmetricAlgorithm,
  kid: string | undefined,
  isExtractable: boolean,
): Promise<KeyHalves | JwtIssue> {
  const { privateKey, publicKey } = pair;
  if (
    privateKey.type !== "private" ||
    (isExtractable && !privateKey.extractable) ||
    !isCryptoKey(publicKey) ||
    publicKey.type !== "public"
  ) {
    return { code: "invalid_key" };
  }
  const purposeIssue = cryptoKeyPurposeIssue(privateKey, alg) ?? cryptoKeyPurposeIssue(publicKey, alg);
  if (purposeIssue !== undefined) {
    return purposeIssue;
  }
  const jwk = await cryptoKeyToJwk(publicKey, alg, "public", undefined);
  if (!jwk.ok) {
    return jwk.issue;
  }
  const material = checkJwk(jwk.value, alg, "public");
  if ("code" in material) {
    return material;
  }
  try {
    const { importParams } = ALGORITHM_PARAMS[alg];
    return {
      privateCryptoKey: privateKey,
      publicCryptoKey: await crypto.subtle.importKey("jwk", material.importJwk, importParams, true, ["verify"]),
      signatureLength: material.signatureLength,
      kid,
    };
  } catch {
    return { code: "invalid_key" };
  }
}

interface CryptoKeyPairInput {
  readonly privateKey: CryptoKey;
  readonly publicKey: unknown;
}

/** `key` as a Web Crypto key pair, when its own `privateKey` is a `CryptoKey`; never throws. */
function readCryptoKeyPair(key: unknown): CryptoKeyPairInput | undefined {
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

/** Members that hold private material in an asymmetric JWK, removed to derive its public half. */
const PRIVATE_MEMBERS = ["d", "p", "q", "dp", "dq", "qi"] as const;

/**
 * Imports an HMAC secret, given as raw bytes (any typed array, `DataView` or `ArrayBuffer`, from any realm),
 * as an untrusted `oct` JWK, or as a Web Crypto `CryptoKey`, bound to one algorithm.
 *
 * @remarks
 * The secret must be at least as long as the algorithm's hash output: 32 bytes for `HS256`, 48 for
 * `HS384`, 64 for `HS512` (RFC 7518 §3.2). For a JWK, `alg`, `use` and `key_ops` (which must include
 * `sign` or `verify`) and `kid` are checked as in {@link importPublicKey}.
 * `key_ops` does not restrict the key: a secret imported with `key_ops: ["verify"]` can still sign.
 *
 * A `CryptoKey` is kept as it is, so a non-extractable one stays so. It must be an HMAC key of the
 * algorithm's hash with both the `sign` and `verify` usages, and extractable when `extractable` is `true`;
 * otherwise it is `invalid_key`, and `weak_key` when shorter than the minimum.
 *
 * @param input - The secret's bytes, as any typed array, `DataView` or `ArrayBuffer`, an `oct` JWK (untrusted, so any object is accepted), or a `CryptoKey`. A string is a
 * compile error, because a string secret is ambiguous; at runtime any other value, a string included, still
 * returns `invalid_key`.
 * @param options - The algorithm, the `kid`, and whether the secret may be
 * exported again.
 * @returns The frozen key, or a failure with one issue: `weak_key` with `{ minimum }` in bytes for a short
 * secret, `invalid_key` for an input that is neither bytes nor a well-formed JWK, and the JWK issues
 * described for {@link importPublicKey}. Issues never contain the secret. Never throws for any `input`.
 * @throws TypeError when `options` is not an object, `options.alg` is not `HS256`, `HS384` or `HS512`, `options.kid` is not
 * a string, or `options.extractable` is not a boolean.
 */
export async function importSecretKey(
  input: Uint8Array | ArrayBuffer | ArrayBufferView | CryptoKey | object,
  options: ImportSecretKeyOptions,
): Promise<JwtResult<SecretKey>> {
  const checked = requireOptions(options, SECRET_KEY_OPTIONS, "importSecretKey");
  const alg = requireSymmetricAlg(checked, "importSecretKey");
  const optionKid = readKid(checked, "importSecretKey");
  const isExtractable = readExtractable(checked, "importSecretKey");
  const buildKey = (kid: string | undefined): SecretKey => ({
    kind: "secret",
    alg,
    ...kidMember(kid),
    extractable: isExtractable,
  });
  // A typed array, `DataView` or `ArrayBuffer` of any realm, copied through intrinsic getters, so an
  // overridden iterator or `length` never runs. A detached buffer holds no bytes and is refused.
  const isBytes = isUint8Array(input) || ArrayBuffer.isView(input) || isArrayBuffer(input);
  const bytes = isBytes ? copyBytes(input) : undefined;
  if (isBytes && bytes === undefined) {
    return fail({ code: "invalid_key" });
  }
  // RFC 7518 §3.2: at least as long as the hash output, which is the signature length.
  const { importParams, signatureBytes } = ALGORITHM_PARAMS[alg];
  const minimum = signatureBytes as number;
  if (isCryptoKey(input)) {
    const issue = checkSecretCryptoKey(
      input,
      (importParams as HmacImportParams).hash as string,
      minimum,
      isExtractable,
    );
    return issue === undefined
      ? ok(registerKey(buildKey(optionKid), { cryptoKey: input, signatureLength: minimum }))
      : fail(issue);
  }
  if (bytes === undefined) {
    return importJwk(input, { alg, role: "secret", isExtractable, kid: optionKid }, buildKey);
  }
  if (bytes.length < minimum) {
    return fail({ code: "weak_key", params: { minimum } });
  }
  const cryptoKey = await crypto.subtle.importKey("raw", bytes, importParams, isExtractable, USAGES.secret);
  return ok(registerKey(buildKey(optionKid), { cryptoKey, signatureLength: minimum }));
}

/**
 * The JWK to check: a PEM string read into the JWK of its material, any other value as given. The caller's
 * object is passed through untouched, so it is never frozen or copied here.
 */
async function sourceJwk(
  key: unknown,
  alg: AsymmetricAlgorithm,
  role: "public" | "private",
  kid: string | undefined,
): Promise<SourceResult> {
  if (typeof key === "string") {
    return pemToJwk(key, alg, role, kid);
  }
  return isCryptoKey(key) ? cryptoKeyToJwk(key, alg, role, kid) : { ok: true, value: key };
}

type SourceResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: JwtIssue };

/**
 * An extractable `CryptoKey` of `role` exported as the JWK of its material, so it is checked exactly as a JWK
 * given directly; `unexpected_private_key` for a private key where a public one is expected, otherwise
 * `invalid_key` for a key of another type or one that cannot be exported.
 */
async function cryptoKeyToJwk(
  cryptoKey: CryptoKey,
  alg: AsymmetricAlgorithm,
  role: "public" | "private",
  kid: string | undefined,
): Promise<SourceResult> {
  if (cryptoKey.type === "private" && role === "public") {
    return { ok: false, issue: { code: "unexpected_private_key" } };
  }
  if (cryptoKey.type !== role) {
    return { ok: false, issue: { code: "invalid_key" } };
  }
  const purposeIssue = cryptoKeyPurposeIssue(cryptoKey, alg);
  if (purposeIssue !== undefined) {
    return { ok: false, issue: purposeIssue };
  }
  if (!cryptoKey.extractable) {
    return { ok: false, issue: { code: "invalid_key" } };
  }
  try {
    return { ok: true, value: await exportMaterialJwk(cryptoKey, alg, kid) };
  } catch {
    return { ok: false, issue: { code: "invalid_key" } };
  }
}

/**
 * Why an asymmetric `CryptoKey` was made for something other than `alg`, or `undefined` when it was not: its
 * algorithm and hash must be the ones `alg` signs with, and a public key must allow verifying. Exporting the
 * key drops all three, so an encryption or key-agreement key, such as `RSA-OAEP` or `ECDH`, would otherwise
 * pass the JWK checks of the same material. The curve is left to those checks.
 */
function cryptoKeyPurposeIssue(cryptoKey: CryptoKey, alg: AsymmetricAlgorithm): JwtIssue | undefined {
  const expected = ALGORITHM_PARAMS[alg].importParams;
  const name = typeof expected === "string" ? expected : expected.name;
  const hash = typeof expected === "object" && "hash" in expected ? expected.hash : undefined;
  const algorithm = cryptoKey.algorithm as Partial<RsaHashedKeyAlgorithm>;
  if (algorithm.name !== name || (hash !== undefined && algorithm.hash?.name !== hash)) {
    return { code: "alg_mismatch" };
  }
  return cryptoKey.type === "public" && !cryptoKey.usages.includes("verify") ? { code: "wrong_use" } : undefined;
}

/**
 * Why an HMAC `CryptoKey` cannot be kept for `alg`, or `undefined` when it can: it must use the algorithm's
 * hash, be at least `minimum` bytes long, allow both signing and verifying, and be extractable when the key
 * is to be.
 */
function checkSecretCryptoKey(
  cryptoKey: CryptoKey,
  hash: string,
  minimum: number,
  isExtractable: boolean,
): JwtIssue | undefined {
  const algorithm = cryptoKey.algorithm as Partial<HmacKeyAlgorithm>;
  if (
    cryptoKey.type !== "secret" ||
    algorithm.name !== "HMAC" ||
    algorithm.hash?.name !== hash ||
    !cryptoKey.usages.includes("sign") ||
    !cryptoKey.usages.includes("verify") ||
    (isExtractable && !cryptoKey.extractable)
  ) {
    return { code: "invalid_key" };
  }
  return (algorithm.length ?? 0) < minimum * 8 ? { code: "weak_key", params: { minimum } } : undefined;
}

interface ImportPlan {
  readonly alg: JwsAlgorithm;
  readonly role: KeyRole;
  readonly isExtractable: boolean;
  /** The `kid` option, for a JWK that has none. */
  readonly kid: string | undefined;
}

/** Whether a JWK's own `kid` and the `kid` option both name the key, differently. */
function isKidConflict(jwkKid: string | undefined, optionKid: string | undefined): boolean {
  return jwkKid !== undefined && optionKid !== undefined && jwkKid !== optionKid;
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
  if (isKidConflict(checked.kid, plan.kid)) {
    return fail({ code: "invalid_key", path: ["kid"] });
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
  return ok(registerKey(buildKey(checked.kid ?? plan.kid), { cryptoKey, signatureLength: checked.signatureLength }));
}
