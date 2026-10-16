import type { JwsAlgorithm } from "./types";

/** Deepest nesting of objects and arrays a header, payload or key set may have; the top-level object is 1. */
export const MAX_JSON_DEPTH = 32;

/** Token length, in characters, accepted when the caller sets no `maxLength`. */
export const DEFAULT_MAX_TOKEN_LENGTH = 8192;

/** Largest `maxLength` a caller may set, so a misconfiguration cannot lift the bound on cost. */
export const MAX_TOKEN_LENGTH_LIMIT = 65_536;

/** Every algorithm this package verifies, compared exactly: `none` and other casings are absent. */
export const JWS_ALGORITHMS: readonly JwsAlgorithm[] = Object.freeze([
  "ES256",
  "EdDSA",
  "Ed25519",
  "RS256",
  "PS256",
  "HS256",
]);

/** Tests whether a value names a supported algorithm, exactly and case-sensitively. */
export const isJwsAlgorithm = (value: unknown): value is JwsAlgorithm =>
  typeof value === "string" && (JWS_ALGORITHMS as readonly string[]).includes(value);
