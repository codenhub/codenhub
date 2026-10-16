import type { AsymmetricAlgorithm, SymmetricAlgorithm } from "../core/types";
import { isAsymmetricAlgorithm } from "./algorithms";

/** Throws unless `options` is an object; returns it for member checks. */
export function requireOptions(options: unknown, functionName: string): Record<string, unknown> {
  if (typeof options !== "object" || options === null) {
    throw new TypeError(`${functionName}: options must be an object.`);
  }
  return options as Record<string, unknown>;
}

export function requireAsymmetricAlg(options: Record<string, unknown>, functionName: string): AsymmetricAlgorithm {
  const { alg } = options;
  if (!isAsymmetricAlgorithm(alg)) {
    throw new TypeError(`${functionName}: options.alg must be one of ES256, EdDSA, Ed25519, RS256, PS256.`);
  }
  return alg;
}

export function requireSymmetricAlg(options: Record<string, unknown>, functionName: string): SymmetricAlgorithm {
  const { alg } = options;
  if (alg !== "HS256") {
    throw new TypeError(`${functionName}: options.alg must be HS256.`);
  }
  return alg;
}

export function readExtractable(options: Record<string, unknown>, functionName: string): boolean {
  const { extractable } = options;
  if (extractable !== undefined && typeof extractable !== "boolean") {
    throw new TypeError(`${functionName}: options.extractable must be a boolean.`);
  }
  return extractable ?? false;
}

export function readKid(options: Record<string, unknown>, functionName: string): string | undefined {
  const { kid } = options;
  if (kid !== undefined && typeof kid !== "string") {
    throw new TypeError(`${functionName}: options.kid must be a string.`);
  }
  return kid;
}
