/** A `prompt` value (OpenID Connect Core §3.1.2.1). */
export type Prompt = "none" | "login" | "consent" | "select_account";

/** Object key or array index leading to the value an issue refers to. */
export type OidcPathSegment = string | number;

/**
 * OAuth 2.0 and OpenID Connect error codes a provider sends to a client, from RFC 6749 §4.1.2.1 and
 * §5.2, RFC 6750 §3.1, and OpenID Connect Core §3.1.2.6.
 */
export type OAuthErrorCode =
  | "invalid_request"
  | "unauthorized_client"
  | "access_denied"
  | "unsupported_response_type"
  | "invalid_scope"
  | "server_error"
  | "temporarily_unavailable"
  | "invalid_client"
  | "invalid_grant"
  | "unsupported_grant_type"
  | "invalid_token"
  | "insufficient_scope"
  | "interaction_required"
  | "login_required"
  | "account_selection_required"
  | "consent_required"
  | "invalid_request_uri"
  | "invalid_request_object"
  | "request_not_supported"
  | "request_uri_not_supported"
  | "registration_not_supported";

/**
 * Stable category of a failure that callers can branch on without parsing messages.
 *
 * Client codes come from `discover` and the client's methods; provider codes from
 * `beginAuthorization` and `completeAuthorization`. A `beginAuthorization` failure that redirects reuses the OAuth
 * error code the client is sent; only the codes it can send are listed, so an exhaustive `switch` has no dead
 * branches. An OAuth code a provider sends to this client is reported as `provider_error` with the code in
 * `params.error`.
 */
export type OidcIssueCode =
  // Client: network and documents
  | "request_failed"
  | "invalid_metadata"
  | "issuer_mismatch"
  | "invalid_token_response"
  | "invalid_userinfo"
  | "provider_error"
  // Client: callback
  | "invalid_callback"
  | "state_mismatch"
  | "iss_mismatch"
  // Client: ID token
  | "invalid_id_token"
  | "nonce_mismatch"
  | "azp_mismatch"
  | "at_hash_mismatch"
  | "auth_time_missing"
  | "auth_too_old"
  | "subject_mismatch"
  // Provider: requests that must not redirect
  | "unknown_client"
  | "invalid_redirect_uri"
  | "interaction_not_found"
  // Provider: requests answered at the client's redirect URI
  | "invalid_request"
  | "unsupported_response_type"
  | "invalid_scope"
  | "request_not_supported"
  | "request_uri_not_supported"
  | "registration_not_supported";

/**
 * A single reason an operation failed.
 *
 * An issue never holds a value taken from untrusted input: no token, code, secret, verifier, claim value,
 * or response body. It names which check failed and, where useful, a fact from the caller's own
 * configuration, the package's limits, or a fixed vocabulary such as an {@link OAuthErrorCode}.
 */
export interface OidcIssue {
  /** Stable failure category. */
  readonly code: OidcIssueCode;
  /** Location the issue refers to, such as `["callback", "state"]` or `["id_token", "payload", "exp"]`. */
  readonly path?: readonly OidcPathSegment[];
  /** Facts that are never input values, such as `{ endpoint: "token", reason: "timeout" }`. */
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}

/** Everything a failed operation found. */
export interface OidcFailure {
  /** Every issue found, in the order checks ran. Never empty. */
  readonly issues: readonly [OidcIssue, ...OidcIssue[]];
}

/** Successful outcome, carrying its value. */
export interface OidcOk<T> {
  readonly ok: true;
  /** The frozen result. */
  readonly value: T;
}

/** Failed outcome, carrying every issue found. */
export interface OidcErr<TFailure extends OidcFailure = OidcFailure> {
  readonly ok: false;
  /** What went wrong. */
  readonly error: TFailure;
}

/**
 * What every operation on untrusted input returns instead of throwing. The shape matches
 * `@codenhub/jwt`'s and `@codenhub/validation`'s results, so code that handles one handles the other.
 */
export type OidcResult<T, TFailure extends OidcFailure = OidcFailure> = OidcOk<T> | OidcErr<TFailure>;

/**
 * An OpenID Provider's metadata (OpenID Connect Discovery 1.0 §3, RFC 8414 §2, RFC 9207 §3), as this
 * package reads and publishes it. Members this package does not use are kept as they were received.
 */
export interface ProviderMetadata {
  /** The issuer identifier. Always equal, byte for byte, to the issuer the document was fetched for. */
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly jwks_uri: string;
  readonly userinfo_endpoint?: string;
  readonly scopes_supported?: readonly string[];
  readonly response_types_supported: readonly string[];
  readonly response_modes_supported?: readonly string[];
  readonly grant_types_supported?: readonly string[];
  readonly subject_types_supported: readonly string[];
  readonly id_token_signing_alg_values_supported: readonly string[];
  readonly token_endpoint_auth_methods_supported?: readonly string[];
  readonly token_endpoint_auth_signing_alg_values_supported?: readonly string[];
  readonly claims_supported?: readonly string[];
  readonly code_challenge_methods_supported?: readonly string[];
  /** The token revocation endpoint (RFC 7009, RFC 8414 §2). */
  readonly revocation_endpoint?: string;
  readonly revocation_endpoint_auth_methods_supported?: readonly string[];
  readonly revocation_endpoint_auth_signing_alg_values_supported?: readonly string[];
  /** Whether the provider sends `iss` in authorization responses (RFC 9207). */
  readonly authorization_response_iss_parameter_supported?: boolean;
  readonly claims_parameter_supported?: boolean;
  readonly request_parameter_supported?: boolean;
  readonly request_uri_parameter_supported?: boolean;
  /** Any other metadata member, unused by this package. */
  readonly [member: string]: unknown;
}

/** Claims of a validated ID token (OpenID Connect Core §2). Frozen. */
export interface IdTokenClaims {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string | readonly string[];
  /** Expiration time, in seconds since the Unix epoch. */
  readonly exp: number;
  /** Issued-at time, in seconds since the Unix epoch. */
  readonly iat: number;
  /** When the user authenticated, in seconds since the Unix epoch. */
  readonly auth_time?: number;
  readonly nonce?: string;
  readonly acr?: string;
  readonly amr?: readonly string[];
  readonly azp?: string;
  readonly at_hash?: string;
  /** Any other claim the provider included. */
  readonly [claim: string]: unknown;
}

/** Claims returned by a userinfo endpoint (OpenID Connect Core §5.3). Frozen. */
export interface UserinfoClaims {
  /** Always equal to the ID token's `sub` the caller expected. */
  readonly sub: string;
  /** Any other claim the provider released for the granted scopes. */
  readonly [claim: string]: unknown;
}
