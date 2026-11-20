import { deepFreeze } from "../core/result";
import type {
  AsymmetricKeyManagementAlgorithm,
  ContentEncryptionAlgorithm,
  JweCurve,
  KeyManagementAlgorithm,
  SymmetricKeyManagementAlgorithm,
} from "./types";

/** Every key management algorithm this package supports, in a stable order. Frozen. */
export const KEY_MANAGEMENT_ALGORITHMS: readonly KeyManagementAlgorithm[] = Object.freeze([
  "dir",
  "A128KW",
  "A256KW",
  "RSA-OAEP",
  "RSA-OAEP-256",
  "ECDH-ES",
  "ECDH-ES+A128KW",
  "ECDH-ES+A256KW",
] as const);

/** Every content encryption algorithm this package supports, in a stable order. Frozen. */
export const CONTENT_ENCRYPTION_ALGORITHMS: readonly ContentEncryptionAlgorithm[] = Object.freeze([
  "A128GCM",
  "A256GCM",
  "A128CBC-HS256",
  "A256CBC-HS512",
] as const);

export const SYMMETRIC_KEY_MANAGEMENT_ALGORITHMS: readonly SymmetricKeyManagementAlgorithm[] = Object.freeze([
  "dir",
  "A128KW",
  "A256KW",
] as const);

export const ASYMMETRIC_KEY_MANAGEMENT_ALGORITHMS: readonly AsymmetricKeyManagementAlgorithm[] = Object.freeze([
  "RSA-OAEP",
  "RSA-OAEP-256",
  "ECDH-ES",
  "ECDH-ES+A128KW",
  "ECDH-ES+A256KW",
] as const);

/** Whether `value` names a supported key management algorithm exactly (case-sensitive). Never throws. */
export function isKeyManagementAlgorithm(value: unknown): value is KeyManagementAlgorithm {
  return typeof value === "string" && (KEY_MANAGEMENT_ALGORITHMS as readonly string[]).includes(value);
}

/** Whether `value` names a supported content encryption algorithm exactly (case-sensitive). Never throws. */
export function isContentEncryptionAlgorithm(value: unknown): value is ContentEncryptionAlgorithm {
  return typeof value === "string" && (CONTENT_ENCRYPTION_ALGORITHMS as readonly string[]).includes(value);
}

export function isSymmetricKeyManagementAlgorithm(value: unknown): value is SymmetricKeyManagementAlgorithm {
  return typeof value === "string" && (SYMMETRIC_KEY_MANAGEMENT_ALGORITHMS as readonly string[]).includes(value);
}

export function isAsymmetricKeyManagementAlgorithm(value: unknown): value is AsymmetricKeyManagementAlgorithm {
  return typeof value === "string" && (ASYMMETRIC_KEY_MANAGEMENT_ALGORITHMS as readonly string[]).includes(value);
}

/** Web Crypto parameters and sizes for one content encryption algorithm (RFC 7518 §5). */
export interface ContentParams {
  /** Length of the whole content key, in bytes. For CBC-HMAC it is MAC_KEY ‖ ENC_KEY, two halves. */
  readonly keyBytes: number;
  /** Length of the initialization vector, in bytes. */
  readonly ivBytes: number;
  /** Length of the authentication tag, in bytes. */
  readonly tagBytes: number;
  /** For CBC-HMAC, the HMAC hash; absent for AES-GCM. */
  readonly hash?: "SHA-256" | "SHA-512";
}

export const CONTENT_PARAMS: Readonly<Record<ContentEncryptionAlgorithm, ContentParams>> = deepFreeze({
  A128GCM: { keyBytes: 16, ivBytes: 12, tagBytes: 16 },
  A256GCM: { keyBytes: 32, ivBytes: 12, tagBytes: 16 },
  "A128CBC-HS256": { keyBytes: 32, ivBytes: 16, tagBytes: 16, hash: "SHA-256" },
  "A256CBC-HS512": { keyBytes: 64, ivBytes: 16, tagBytes: 32, hash: "SHA-512" },
} satisfies Record<ContentEncryptionAlgorithm, ContentParams>);

/** Web Crypto parameters for one curve an `ECDH-ES` key may use. */
export interface CurveParams {
  readonly kty: "EC" | "OKP";
  readonly importParams: EcKeyImportParams | Algorithm;
  /** Byte length of each coordinate, of `d`, and of the shared secret Z. */
  readonly coordinateBytes: number;
}

export const CURVE_PARAMS: Readonly<Record<JweCurve, CurveParams>> = deepFreeze({
  "P-256": { kty: "EC", importParams: { name: "ECDH", namedCurve: "P-256" }, coordinateBytes: 32 },
  "P-384": { kty: "EC", importParams: { name: "ECDH", namedCurve: "P-384" }, coordinateBytes: 48 },
  "P-521": { kty: "EC", importParams: { name: "ECDH", namedCurve: "P-521" }, coordinateBytes: 66 },
  X25519: { kty: "OKP", importParams: { name: "X25519" }, coordinateBytes: 32 },
} satisfies Record<JweCurve, CurveParams>);

export const JWE_CURVES: readonly JweCurve[] = Object.freeze(["P-256", "P-384", "P-521", "X25519"] as const);

export function isJweCurve(value: unknown): value is JweCurve {
  return typeof value === "string" && (JWE_CURVES as readonly string[]).includes(value);
}

/** The RSA-OAEP hash of each RSA key management algorithm (RFC 7518 §4.3). */
export const OAEP_HASH: Readonly<Record<"RSA-OAEP" | "RSA-OAEP-256", "SHA-1" | "SHA-256">> = Object.freeze({
  "RSA-OAEP": "SHA-1",
  "RSA-OAEP-256": "SHA-256",
});

/** Length of the key-encryption key an AES key wrap uses, in bytes. */
export const KEY_WRAP_BYTES: Readonly<Record<"A128KW" | "A256KW" | "ECDH-ES+A128KW" | "ECDH-ES+A256KW", number>> =
  Object.freeze({ A128KW: 16, A256KW: 32, "ECDH-ES+A128KW": 16, "ECDH-ES+A256KW": 32 });

export type RsaKeyManagementAlgorithm = "RSA-OAEP" | "RSA-OAEP-256";
export type EcdhKeyManagementAlgorithm = "ECDH-ES" | "ECDH-ES+A128KW" | "ECDH-ES+A256KW";

export function isRsaAlgorithm(alg: KeyManagementAlgorithm): alg is RsaKeyManagementAlgorithm {
  return alg === "RSA-OAEP" || alg === "RSA-OAEP-256";
}

export function isEcdhAlgorithm(alg: KeyManagementAlgorithm): alg is EcdhKeyManagementAlgorithm {
  return alg === "ECDH-ES" || alg === "ECDH-ES+A128KW" || alg === "ECDH-ES+A256KW";
}

/** Whether a token with this `alg` carries an empty encrypted key segment (RFC 7516 §5.1 step 5). */
export function hasEmptyEncryptedKey(alg: KeyManagementAlgorithm): boolean {
  return alg === "dir" || alg === "ECDH-ES";
}
