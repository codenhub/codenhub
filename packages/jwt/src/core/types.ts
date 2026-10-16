import type { StandardSchemaV1 } from "../interop/standard-schema";

/** Object key or array index leading to a value inside a token's header or payload. */
export type JwtPathSegment = string | number;

/**
 * Stable category of a failure that callers can branch on without parsing messages.
 *
 * Token codes come from {@link Verifier} and {@link readHeader}; key codes from the `import*`
 * functions and key sets; `key_fetch_failed` from any key set that fails, remote or custom.
 */
export type JwtIssueCode =
  // Token structure
  | "malformed"
  | "too_large"
  | "duplicate_key"
  | "unsupported_crit"
  | "unsupported_alg"
  // Key selection and signature
  | "unknown_kid"
  | "no_matching_key"
  | "ambiguous_key"
  | "alg_mismatch"
  | "bad_signature"
  | "key_fetch_failed"
  // Claims
  | "expired"
  | "not_yet_valid"
  | "issued_in_future"
  | "too_old"
  | "wrong_issuer"
  | "wrong_audience"
  | "wrong_type"
  | "missing_claim"
  | "invalid_claim"
  | "invalid_claims"
  // Key import
  | "invalid_key"
  | "unsupported_key"
  | "weak_key"
  | "unexpected_private_key"
  | "wrong_use";

/**
 * A single reason a token or key was rejected.
 *
 * An issue this package creates never holds a value taken from the input: no token segment, claim value,
 * header value, or key material. It names which check failed and, where useful, the limit or the claim the
 * check used. An `invalid_claims` path is whatever the caller's schema reports, which for a record-style
 * schema can include claim names from the token. A custom key set's issues are passed through, so those
 * hold only what the caller's code puts in them.
 */
export interface JwtIssue {
  /** Stable failure category. */
  readonly code: JwtIssueCode;
  /**
   * Location the issue refers to, such as `["payload", "exp"]` or `["header", "kid"]`. Omitted when the
   * issue concerns the token or key as a whole.
   */
  readonly path?: readonly JwtPathSegment[];
  /**
   * Facts taken from the caller's own configuration or from this package's limits, such as
   * `{ maximum: 8192 }` for `too_large` or `{ claim: "sub" }` for `missing_claim`. Never an input value.
   */
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}

/** Everything a failed operation found. */
export interface JwtFailure {
  /** Every issue found, in the order checks ran. Never empty. */
  readonly issues: readonly [JwtIssue, ...JwtIssue[]];
}

/** Successful outcome, carrying its value. */
export interface JwtOk<T> {
  readonly ok: true;
  /** The frozen result. */
  readonly value: T;
}

/** Failed outcome, carrying every issue found. */
export interface JwtErr {
  readonly ok: false;
  /** What went wrong. */
  readonly error: JwtFailure;
}

/**
 * What every operation on untrusted input returns instead of throwing. The shape matches
 * `@codenhub/validation`'s result, so code that handles one handles the other.
 */
export type JwtResult<T> = JwtOk<T> | JwtErr;

/** Asymmetric JWS algorithms this package signs and verifies with. */
export type AsymmetricAlgorithm = "ES256" | "EdDSA" | "Ed25519" | "RS256" | "PS256";

/** Symmetric (HMAC) JWS algorithms this package signs and verifies with. */
export type SymmetricAlgorithm = "HS256";

/** Every JWS algorithm this package supports. `none` is never one of them. */
export type JwsAlgorithm = AsymmetricAlgorithm | SymmetricAlgorithm;

/**
 * An asymmetric public key bound to exactly one algorithm. It only verifies.
 *
 * Keys are opaque: the key material is held internally and never appears in the object, its JSON form,
 * or any issue. Only keys created by this package are accepted; a look-alike object throws `TypeError`.
 */
export interface PublicKey {
  /** Discriminates the three key kinds. */
  readonly kind: "public";
  /** The one algorithm this key verifies with. A token whose header names another fails. */
  readonly alg: AsymmetricAlgorithm;
  /** Key identifier used for selection, from the JWK `kid` or the generation options. */
  readonly kid?: string;
}

/** An asymmetric private key bound to exactly one algorithm. It only signs. */
export interface PrivateKey {
  /** Discriminates the three key kinds. */
  readonly kind: "private";
  /** The one algorithm this key signs with. */
  readonly alg: AsymmetricAlgorithm;
  /** Key identifier written to the `kid` header of tokens this key signs, unless overridden. */
  readonly kid?: string;
  /** Whether {@link exportPrivateJwk} may export this key's material. */
  readonly extractable: boolean;
}

/**
 * A symmetric (HMAC) secret bound to exactly one algorithm. It signs and verifies, and is never
 * interchangeable with an asymmetric key: a key set or verifier holding public keys never selects it
 * for a token whose header names an asymmetric algorithm, and the reverse.
 */
export interface SecretKey {
  /** Discriminates the three key kinds. */
  readonly kind: "secret";
  /** The one algorithm this key signs and verifies with. */
  readonly alg: SymmetricAlgorithm;
  /** Key identifier used for selection and written to the `kid` header when signing. */
  readonly kid?: string;
  /** Whether {@link exportSecretJwk} may export this key's material. */
  readonly extractable: boolean;
}

/** A key that can sign. */
export type SigningKey = PrivateKey | SecretKey;

/** A key that can verify. */
export type VerificationKey = PublicKey | SecretKey;

/** A JSON Web Key as this package exports it. Every exported JWK is frozen. */
export interface Jwk {
  readonly kty: "EC" | "OKP" | "RSA" | "oct";
  readonly alg: JwsAlgorithm;
  readonly use: "sig";
  readonly kid?: string;
  readonly crv?: "P-256" | "Ed25519";
  readonly x?: string;
  readonly y?: string;
  readonly n?: string;
  readonly e?: string;
  readonly d?: string;
  readonly p?: string;
  readonly q?: string;
  readonly dp?: string;
  readonly dq?: string;
  readonly qi?: string;
  readonly k?: string;
}

/** A verified or inspected JWS protected header. Frozen. */
export interface JwtHeader {
  /** The algorithm the token claims. Always one this package supports. */
  readonly alg: JwsAlgorithm;
  /** Key identifier, when the token names one. */
  readonly kid?: string;
  /** Media type of the whole token, such as `JWT` or `at+jwt`. */
  readonly typ?: string;
  /** Media type of the payload. */
  readonly cty?: string;
  /** Any other header parameter, unverified in meaning and never used by this package. */
  readonly [parameter: string]: unknown;
}

/** Registered JWT claims (RFC 7519 §4.1), plus any other claim. Frozen. */
export interface JwtPayload {
  readonly iss?: string;
  readonly sub?: string;
  readonly aud?: string | readonly string[];
  /** Expiration time, in seconds since the Unix epoch. */
  readonly exp?: number;
  /** Not-before time, in seconds since the Unix epoch. */
  readonly nbf?: number;
  /** Issued-at time, in seconds since the Unix epoch. */
  readonly iat?: number;
  readonly jti?: string;
  readonly [claim: string]: unknown;
}

/**
 * A source of verification keys. A verifier asks it for the one key that matches a token's header.
 *
 * {@link createKeySet}, {@link importKeySet} and {@link createRemoteKeySet} return one.
 */
export interface KeySet {
  /**
   * Selects the single key for a header. With a `kid`, only keys with that `kid` are candidates;
   * without one, the set must hold exactly one key compatible with the header's `alg`. Keys are never
   * tried in turn.
   *
   * @param header - The token's header, as {@link readHeader} returned it.
   * @returns The selected key, or a failure with `unknown_kid`, `alg_mismatch`, `no_matching_key`,
   * `ambiguous_key`, or `key_fetch_failed`. Never throws for any header.
   */
  select(header: JwtHeader): Promise<JwtResult<VerificationKey>>;
}

/** A verified token. Frozen. */
export interface VerifiedJwt<TPayload extends JwtPayload = JwtPayload> {
  /** The protected header. */
  readonly header: JwtHeader;
  /** The payload, after every configured claim check passed. */
  readonly payload: TPayload;
  /** The key whose signature matched. */
  readonly key: VerificationKey;
}

/** How {@link createVerifier} checks a token. Invalid options throw `TypeError` when the verifier is created. */
export interface VerifierOptions<TSchema extends StandardSchemaV1 | undefined = undefined> {
  /** Where verification keys come from. */
  readonly keys: KeySet;
  /** Accepted `iss` values. When set, `iss` is required and must equal one exactly. */
  readonly issuer?: string | readonly string[];
  /**
   * Accepted audiences. When set, `aud` is required, and a token passes when its `aud` (a string or
   * an array) contains at least one of them.
   */
  readonly audience?: string | readonly string[];
  /**
   * Required `typ` header value, such as `JWT` or `at+jwt`. Compared case-insensitively, with an
   * `application/` prefix ignored on either side (RFC 7515 §4.1.9). When set, `typ` is required.
   */
  readonly type?: string;
  /**
   * Seconds of clock skew allowed on `exp`, `nbf` and `iat`. An integer from 0 through 300.
   *
   * @defaultValue 0
   */
  readonly clockTolerance?: number;
  /** Maximum seconds since `iat`. When set, `iat` is required. A positive integer. */
  readonly maxAge?: number;
  /**
   * Maximum token length in characters, checked before any decoding. An integer from 1 through 65536.
   *
   * @defaultValue 8192
   */
  readonly maxLength?: number;
  /** Claims that must be present, whatever their value. */
  readonly requiredClaims?: readonly string[];
  /**
   * Standard Schema run on the payload after every other check passed. Its issues become
   * `invalid_claims` issues carrying only their path; its messages are dropped, since they may quote
   * the input. The schema checks; it does not transform: the returned payload is the token's own.
   */
  readonly claims?: TSchema;
  /**
   * Current time in milliseconds since the Unix epoch, for tests.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
}

/** The payload type a verifier with the given schema returns. */
export type VerifiedPayload<TSchema extends StandardSchemaV1 | undefined> = TSchema extends StandardSchemaV1
  ? JwtPayload & StandardSchemaV1.InferInput<TSchema>
  : JwtPayload;

/**
 * A configured verifier. Call it with any value; it never throws for a token, whatever its content.
 * Only a `claims` schema that throws or rejects makes its promise reject.
 *
 * @returns The verified token, or every issue found. Structural, key, and signature failures stop at
 * the first issue; claim checks report every failing claim.
 */
export type Verifier<TPayload extends JwtPayload = JwtPayload> = (
  token: unknown,
) => Promise<JwtResult<VerifiedJwt<TPayload>>>;
