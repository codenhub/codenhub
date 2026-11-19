import { deepFreeze, JWS_ALGORITHMS } from "../core";
import type { AsymmetricAlgorithm, JwsAlgorithm, SymmetricAlgorithm } from "../core/types";

/** JWK `kty` values this package understands. */
export type KeyType = "EC" | "OKP" | "RSA" | "oct";

/** JWK `crv` values this package understands. */
export type Curve = "P-256" | "P-384" | "P-521" | "Ed25519";

/** Web Crypto parameters and JWK shape for one JWS algorithm. */
export interface AlgorithmParams {
  /** JWK `kty` a key for this algorithm must have. */
  readonly kty: KeyType;
  /** JWK `crv` a key for this algorithm must have, for `EC` and `OKP` keys. */
  readonly crv?: Curve;
  /** Second argument to `crypto.subtle.importKey`. */
  readonly importParams: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams | HmacImportParams;
  /** First argument to `crypto.subtle.sign` and `crypto.subtle.verify`. */
  readonly signParams: AlgorithmIdentifier | EcdsaParams | RsaPssParams;
  /**
   * Exact byte length of a signature, for every algorithm but RSA, whose signature is as long as its
   * modulus. For HMAC it is also the least secret length (RFC 7518 §3.2).
   */
  readonly signatureBytes?: number;
  /** Byte length of each curve coordinate, and of `d`, for `EC` and `OKP` keys. */
  readonly coordinateBytes?: number;
}

const ED25519: AlgorithmParams = {
  kty: "OKP",
  crv: "Ed25519",
  importParams: "Ed25519",
  signParams: "Ed25519",
  signatureBytes: 64,
  coordinateBytes: 32,
};

/** ECDSA on a NIST curve: the signature is r ‖ s, each as long as a coordinate (RFC 7518 §3.4). */
const ecdsa = (curve: "P-256" | "P-384" | "P-521", hash: string, coordinateBytes: number): AlgorithmParams => ({
  kty: "EC",
  crv: curve,
  importParams: { name: "ECDSA", namedCurve: curve },
  signParams: { name: "ECDSA", hash },
  signatureBytes: coordinateBytes * 2,
  coordinateBytes,
});

const rsaPkcs1 = (hash: string): AlgorithmParams => ({
  kty: "RSA",
  importParams: { name: "RSASSA-PKCS1-v1_5", hash },
  signParams: { name: "RSASSA-PKCS1-v1_5" },
});

/** RFC 7518 §3.5: the PSS salt is as long as the hash output. */
const rsaPss = (hash: string, saltLength: number): AlgorithmParams => ({
  kty: "RSA",
  importParams: { name: "RSA-PSS", hash },
  signParams: { name: "RSA-PSS", saltLength },
});

const hmac = (hash: string, signatureBytes: number): AlgorithmParams => ({
  kty: "oct",
  importParams: { name: "HMAC", hash },
  signParams: { name: "HMAC" },
  signatureBytes,
});

/**
 * Web Crypto parameters for every supported JWS algorithm, shared by import, signing and verification.
 * Frozen deeply, since `EdDSA` and `Ed25519` share one row.
 */
export const ALGORITHM_PARAMS: Readonly<Record<JwsAlgorithm, AlgorithmParams>> = deepFreeze({
  ES256: ecdsa("P-256", "SHA-256", 32),
  ES384: ecdsa("P-384", "SHA-384", 48),
  ES512: ecdsa("P-521", "SHA-512", 66),
  EdDSA: ED25519,
  Ed25519: ED25519,
  RS256: rsaPkcs1("SHA-256"),
  RS384: rsaPkcs1("SHA-384"),
  RS512: rsaPkcs1("SHA-512"),
  PS256: rsaPss("SHA-256", 32),
  PS384: rsaPss("SHA-384", 48),
  PS512: rsaPss("SHA-512", 64),
  HS256: hmac("SHA-256", 32),
  HS384: hmac("SHA-384", 48),
  HS512: hmac("SHA-512", 64),
} satisfies Record<JwsAlgorithm, AlgorithmParams>);

/** Every asymmetric algorithm, in a stable order. */
export const ASYMMETRIC_ALGORITHMS: readonly AsymmetricAlgorithm[] = Object.freeze(
  JWS_ALGORITHMS.filter((alg): alg is AsymmetricAlgorithm => ALGORITHM_PARAMS[alg].kty !== "oct"),
);

/** Every symmetric algorithm, in a stable order. */
export const SYMMETRIC_ALGORITHMS: readonly SymmetricAlgorithm[] = Object.freeze(
  JWS_ALGORITHMS.filter((alg): alg is SymmetricAlgorithm => ALGORITHM_PARAMS[alg].kty === "oct"),
);

/** Whether `value` names a supported asymmetric algorithm exactly (case-sensitive). */
export function isAsymmetricAlgorithm(value: unknown): value is AsymmetricAlgorithm {
  return typeof value === "string" && (ASYMMETRIC_ALGORITHMS as readonly string[]).includes(value);
}

/** Whether `value` names a supported symmetric algorithm exactly (case-sensitive). */
export function isSymmetricAlgorithm(value: unknown): value is SymmetricAlgorithm {
  return typeof value === "string" && (SYMMETRIC_ALGORITHMS as readonly string[]).includes(value);
}

/**
 * Lists the algorithms a JWK's `kty` and `crv` allow, ignoring every other member. A JWK that is not an
 * object, or whose `kty`/`crv` this package does not support, allows none. Never throws.
 */
export function compatibleAlgorithms(jwk: unknown): readonly JwsAlgorithm[] {
  try {
    if (typeof jwk !== "object" || jwk === null) {
      return [];
    }
    const kty = ownDataValue(jwk, "kty");
    const crv = ownDataValue(jwk, "crv");
    return JWS_ALGORITHMS.filter((alg) => {
      const params = ALGORITHM_PARAMS[alg];
      return params.kty === kty && (params.crv === undefined || params.crv === crv);
    });
  } catch {
    // A hostile Proxy can throw from any trap; such a JWK allows nothing.
    return [];
  }
}

/** Reads an own data property without running getters. */
export function ownDataValue(target: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}
