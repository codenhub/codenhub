import { deepFreeze, JWS_ALGORITHMS } from "../core";
import type { AsymmetricAlgorithm, JwsAlgorithm } from "../core/types";

/** JWK `kty` values this package understands. */
export type KeyType = "EC" | "OKP" | "RSA" | "oct";

/** Web Crypto parameters and JWK shape for one JWS algorithm. */
export interface AlgorithmParams {
  /** JWK `kty` a key for this algorithm must have. */
  readonly kty: KeyType;
  /** JWK `crv` a key for this algorithm must have, for `EC` and `OKP` keys. */
  readonly crv?: "P-256" | "Ed25519";
  /** Second argument to `crypto.subtle.importKey`. */
  readonly importParams: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams | HmacImportParams;
  /** First argument to `crypto.subtle.sign` and `crypto.subtle.verify`. */
  readonly signParams: AlgorithmIdentifier | EcdsaParams | RsaPssParams;
}

const SHA_256 = "SHA-256";
/** RFC 7518 §3.5: the PSS salt is as long as the hash output. */
const PS256_SALT_LENGTH = 32;
const ED25519: AlgorithmParams = { kty: "OKP", crv: "Ed25519", importParams: "Ed25519", signParams: "Ed25519" };

/**
 * Web Crypto parameters for every supported JWS algorithm, shared by import, signing and verification.
 * Frozen deeply, since `EdDSA` and `Ed25519` share one row.
 */
export const ALGORITHM_PARAMS: Readonly<Record<JwsAlgorithm, AlgorithmParams>> = deepFreeze({
  ES256: {
    kty: "EC",
    crv: "P-256",
    importParams: { name: "ECDSA", namedCurve: "P-256" },
    signParams: { name: "ECDSA", hash: SHA_256 },
  },
  EdDSA: ED25519,
  Ed25519: ED25519,
  RS256: {
    kty: "RSA",
    importParams: { name: "RSASSA-PKCS1-v1_5", hash: SHA_256 },
    signParams: { name: "RSASSA-PKCS1-v1_5" },
  },
  PS256: {
    kty: "RSA",
    importParams: { name: "RSA-PSS", hash: SHA_256 },
    signParams: { name: "RSA-PSS", saltLength: PS256_SALT_LENGTH },
  },
  HS256: {
    kty: "oct",
    importParams: { name: "HMAC", hash: SHA_256 },
    signParams: { name: "HMAC" },
  },
} satisfies Record<JwsAlgorithm, AlgorithmParams>);

/** Every asymmetric algorithm, in a stable order. */
export const ASYMMETRIC_ALGORITHMS: readonly AsymmetricAlgorithm[] = Object.freeze([
  "ES256",
  "EdDSA",
  "Ed25519",
  "RS256",
  "PS256",
]);

/** Whether `value` names a supported asymmetric algorithm exactly (case-sensitive). */
export function isAsymmetricAlgorithm(value: unknown): value is AsymmetricAlgorithm {
  return typeof value === "string" && (ASYMMETRIC_ALGORITHMS as readonly string[]).includes(value);
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
