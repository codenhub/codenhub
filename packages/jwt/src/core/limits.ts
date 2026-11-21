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
  "ES384",
  "ES512",
  "EdDSA",
  "Ed25519",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "HS256",
  "HS384",
  "HS512",
]);

/** Tests whether a value names a supported algorithm, exactly and case-sensitively. */
export const isJwsAlgorithm = (value: unknown): value is JwsAlgorithm =>
  typeof value === "string" && (JWS_ALGORITHMS as readonly string[]).includes(value);

/**
 * Most signatures a general JWS JSON serialization may hold, when signing and when verifying: each one costs a
 * key selection and a signature check.
 */
export const MAX_JWS_SIGNATURES = 8;

/**
 * Header parameter names RFC 7515 and RFC 7518 define, which a `crit` list must not name (RFC 7515 §4.1.11):
 * `crit` is for extensions.
 */
export const REGISTERED_HEADER_NAMES: readonly string[] = Object.freeze([
  "alg",
  "jku",
  "jwk",
  "kid",
  "x5u",
  "x5c",
  "x5t",
  "x5t#S256",
  "typ",
  "cty",
  "crit",
  "enc",
  "zip",
  "epk",
  "apu",
  "apv",
  "iv",
  "tag",
  "p2s",
  "p2c",
]);

/**
 * The last second of 9999-12-31, the latest a numeric date may name (scope.md decision 45). Every timestamp in
 * milliseconds since 1978 is larger, so `Date.now()` given in place of seconds is caught rather than signing a
 * token that expires in some 55,000 years.
 */
export const MAX_NUMERIC_DATE = 253_402_300_799;

/**
 * The longest duration in seconds an option takes, ten years of 365 days. `Date.now()`, or a duration in
 * milliseconds of four days or more, is larger, so either given in place of seconds throws (scope.md decision
 * 55). A shorter duration in milliseconds passes as a longer one in seconds; the option names say seconds.
 */
export const MAX_DURATION_SECONDS = 315_360_000;
