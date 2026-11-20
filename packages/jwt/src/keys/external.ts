import { rejectUnknownOptions } from "../core/options";
import type { PrivateKey, PublicKey } from "../core/types";
import { getKeyEntry, isRegisteredKey, kidMember, registerKey } from "./registry";

/** Options of {@link createExternalSigningKey}. */
export interface ExternalSigningKeyOptions {
  /**
   * The public key of the key the signer holds. It gives the signing key its `alg` and `kid`, and every
   * signature is verified with it before a token is returned.
   */
  readonly publicKey: PublicKey;
  /**
   * Signs `data`, the JWS signing input, with the external key, and resolves to the signature. Its rejection
   * rejects the `sign` call unchanged. It is called once per token.
   */
  readonly sign: (data: Uint8Array<ArrayBuffer>) => Promise<Uint8Array | ArrayBuffer>;
  /**
   * The form of the signatures `sign` resolves to: `"raw"`, as JWS writes them, or `"der"`, the DER
   * `Ecdsa-Sig-Value` (RFC 3279 §2.2.3) that AWS KMS, Google Cloud KMS and PKCS#11 tokens often return for
   * an ECDSA key, which is converted. `"der"` is only for `ES256`, `ES384` and `ES512`.
   *
   * @defaultValue `"raw"`
   */
  readonly signatureFormat?: "raw" | "der";
}

const OPTION_MEMBERS: Readonly<Record<keyof ExternalSigningKeyOptions, true>> = {
  publicKey: true,
  sign: true,
  signatureFormat: true,
};

const ECDSA_ALGORITHMS: ReadonlySet<string> = new Set(["ES256", "ES384", "ES512"]);
const DER_SEQUENCE = 0x30;
const DER_INTEGER = 0x02;
/** A DER length byte with the top bit set counts the length bytes that follow; ECDSA needs at most one. */
const DER_LONG_LENGTH_ONE_BYTE = 0x81;

/**
 * Creates a private key whose signatures come from a function, for a key held outside Web Crypto, such as
 * in a cloud KMS or an HSM, whose private material never leaves it.
 *
 * @remarks
 * The key signs with {@link sign} like any other private key: `alg` and `kid` come from `publicKey`, and
 * {@link getPublicKey}, {@link jwkThumbprint} and `embedKey` work with it. Each signature the function
 * returns is verified with `publicKey` before `sign` returns the token, so a signer holding another key, or
 * returning malformed bytes, makes `sign` throw instead of handing out a token no one can verify. The key is
 * never extractable, and the function is not called until a token is signed.
 *
 * @example
 * ```ts
 * const imported = await importPublicKey(kmsPublicKeyPem, { alg: "ES256", kid: "kms-2026" });
 * if (!imported.ok) throw new Error("The KMS public key could not be imported.");
 * const signingKey = createExternalSigningKey({
 *   publicKey: imported.value,
 *   signatureFormat: "der",
 *   sign: async (data) => (await kms.sign({ KeyId, Message: data, MessageType: "RAW",
 *     SigningAlgorithm: "ECDSA_SHA_256" })).Signature!,
 * });
 * const token = await sign({ payload: { sub: "u1", exp }, key: signingKey });
 * ```
 *
 * @param options - The public key and the signing function.
 * @returns The frozen private key, with `extractable: false`.
 * @throws TypeError when `options` is not an object; `options.publicKey` is not a public key this package
 * created; `options.sign` is not a function; `options.signatureFormat` is neither `"raw"` nor `"der"`, or is
 * `"der"` for a key that is not ECDSA; or `options` has another member.
 */
export function createExternalSigningKey(options: ExternalSigningKeyOptions): PrivateKey {
  const name = "createExternalSigningKey";
  if (typeof options !== "object" || options === null) {
    throw new TypeError(`${name}: options must be an object.`);
  }
  rejectUnknownOptions(options, OPTION_MEMBERS, name);
  const { publicKey, sign: signer, signatureFormat = "raw" } = options;
  if (!isRegisteredKey(publicKey) || publicKey.kind !== "public") {
    throw new TypeError(`${name}: options.publicKey must be a public key this package created.`);
  }
  if (typeof signer !== "function") {
    throw new TypeError(`${name}: options.sign must be a function.`);
  }
  if (signatureFormat !== "raw" && signatureFormat !== "der") {
    throw new TypeError(`${name}: options.signatureFormat must be "raw" or "der".`);
  }
  if (signatureFormat === "der" && !ECDSA_ALGORITHMS.has(publicKey.alg)) {
    throw new TypeError(`${name}: options.signatureFormat "der" needs an ES256, ES384 or ES512 key.`);
  }
  const { cryptoKey, signatureLength } = getKeyEntry(publicKey);
  const externalSign = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
    const signature = await signer(data);
    const bytes = toBytes(signature);
    return signatureFormat === "der" ? derToRaw(bytes, signatureLength / 2) : bytes;
  };
  return registerKey<PrivateKey>(
    { kind: "private", alg: publicKey.alg, ...kidMember(publicKey.kid), extractable: false },
    { cryptoKey, signatureLength, publicCryptoKey: cryptoKey, externalSign },
  );
}

/** A copy of the signer's bytes, so a buffer it reuses cannot change the token after the check. */
function toBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }
  throw new TypeError("sign: the external signer must resolve to a Uint8Array or an ArrayBuffer.");
}

/**
 * Converts a DER `Ecdsa-Sig-Value` to JWS's `r || s`, each padded to `size` bytes (RFC 7518 §3.4). Only
 * strict DER is read: minimal lengths and integers, non-negative values, and nothing after the sequence.
 */
function derToRaw(der: Uint8Array<ArrayBuffer>, size: number): Uint8Array<ArrayBuffer> {
  const malformed = new TypeError("sign: the external signer returned a malformed DER signature.");
  if (der[0] !== DER_SEQUENCE) {
    throw malformed;
  }
  let offset = 2;
  let length = der[1] ?? 0;
  if (length === DER_LONG_LENGTH_ONE_BYTE) {
    length = der[2] ?? 0;
    offset = 3;
    if (length < 0x80) {
      throw malformed;
    }
  } else if (length >= 0x80) {
    throw malformed;
  }
  if (offset + length !== der.length) {
    throw malformed;
  }
  const raw = new Uint8Array(size * 2);
  for (const half of [0, 1]) {
    if (der[offset] !== DER_INTEGER) {
      throw malformed;
    }
    const integerLength = der[offset + 1] ?? 0;
    const start = offset + 2;
    const end = start + integerLength;
    const first = der[start] ?? 0;
    const isNonMinimal = integerLength > 1 && first === 0 && (der[start + 1] ?? 0) < 0x80;
    if (integerLength === 0 || integerLength >= 0x80 || end > der.length || first >= 0x80 || isNonMinimal) {
      throw malformed;
    }
    const value = der.subarray(first === 0 && integerLength > 1 ? start + 1 : start, end);
    if (value.length > size) {
      throw malformed;
    }
    raw.set(value, half * size + size - value.length);
    offset = end;
  }
  if (offset !== der.length) {
    throw malformed;
  }
  return raw;
}
