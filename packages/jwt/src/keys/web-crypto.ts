/**
 * Web Crypto helpers for keys. This module imports no algorithm table, so a module can use it without carrying
 * the tables into a bundle.
 */
import { isCryptoKey } from "./exported-jwk";

/** The RSA public exponent every generated RSA key uses, 65537. */
export const RSA_PUBLIC_EXPONENT = new Uint8Array([1, 0, 1]);

/**
 * Retries after an `OperationError` from an OKP pair generation, as {@link generatePair} explains; four failures in
 * a row are about 1 in 2^28.
 */
export const OKP_GENERATION_RETRIES = 3;

/** The JWK members that hold private material in an RSA, EC or OKP private key. */
export const PAIR_PRIVATE_MEMBERS = ["d", "p", "q", "dp", "dq", "qi"] as const;

/**
 * Generates a pair, retrying a generation rejected with `OperationError` up to `retries` times. Linux
 * WebKit's libgcrypt backend fails about 1 Ed25519 generation in 128, when the new key's `d` or `x` starts
 * with a zero byte; a retry draws a new key. packages/jwt/AGENTS.md has the evidence and says when this can go.
 */
export async function generatePair(
  algorithm: AlgorithmIdentifier | RsaHashedKeyGenParams | EcKeyGenParams,
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

/** A Web Crypto `CryptoKeyPair` given as a key, read without invoking a getter. */
export interface CryptoKeyPairInput {
  readonly privateKey: CryptoKey;
  /** Untrusted: the caller checks it is a `CryptoKey` matching `privateKey`. */
  readonly publicKey: unknown;
}

/**
 * Reads a `CryptoKeyPair` from an untrusted value by its own data properties, so a getter or a proxy trap never
 * runs. Never throws.
 *
 * @returns The pair, or undefined when `value` is a `CryptoKey` or has no `CryptoKey` as its `privateKey`.
 */
export function readCryptoKeyPair(value: unknown): CryptoKeyPairInput | undefined {
  if (typeof value !== "object" || value === null || isCryptoKey(value)) {
    return undefined;
  }
  try {
    const privateKey: unknown = Object.getOwnPropertyDescriptor(value, "privateKey")?.value;
    const publicKey: unknown = Object.getOwnPropertyDescriptor(value, "publicKey")?.value;
    return isCryptoKey(privateKey) ? { privateKey, publicKey } : undefined;
  } catch {
    // A proxy's trap may throw; such a value is no key pair.
    return undefined;
  }
}
