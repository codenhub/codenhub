import type { KeyPair, KeySet, SecretKey } from "@codenhub/jwt";

import type { OidcFailure, OidcResult, Prompt, ProviderMetadata } from "../shared/types";

/**
 * How a registered client authenticates to the token endpoint, and what the provider checks it against.
 *
 * Secrets are never stored in plaintext: `secretHash` is what {@link hashClientSecret} returns for the
 * secret {@link generateClientSecret} created. `client_secret_jwt` is the exception, because an HMAC
 * can only be checked with the secret itself.
 */
export type ClientAuthentication =
  | { readonly method: "none" }
  | { readonly method: "client_secret_basic"; readonly secretHash: string }
  | { readonly method: "client_secret_post"; readonly secretHash: string }
  /** The client's HS256 secret, from `importSecretKey`. */
  | { readonly method: "client_secret_jwt"; readonly key: SecretKey }
  /** The client's public keys, from `createKeySet`, `importKeySet`, or `createRemoteKeySet`. */
  | { readonly method: "private_key_jwt"; readonly keys: KeySet };

/**
 * A grant a client may use at the token endpoint. `authorization_code` signs users in, and brings the refresh
 * grant with it under `offline_access`; `client_credentials` gets the client an access token for itself
 * (RFC 6749 §4.4).
 */
export type GrantType = "authorization_code" | "client_credentials";

/** A registered client, as the store returns it. A malformed record throws `TypeError` when used. */
export interface ClientRecord {
  readonly clientId: string;
  /**
   * Redirect URIs, each compared to the requested one byte for byte. The list must be non-empty when the client
   * may use `authorization_code`, and may be empty otherwise. The provider checks each entry when it reads the
   * record and throws `TypeError` if one fails: it must be a non-empty string, an absolute URL, made of visible
   * ASCII only (no space, control character or backslash), without a fragment (`#`) or credentials, and with a
   * scheme other than `javascript:`, `data:`, `vbscript:` or `file:`.
   */
  readonly redirectUris: readonly string[];
  /**
   * Scopes this client may request. Must include `openid` when the client may use `authorization_code`. A
   * `client_credentials` token never carries `openid` or `offline_access`, since no user is involved.
   */
  readonly scopes: readonly string[];
  /**
   * Grants this client may use, without repeats, naming at least one: an empty list throws a `TypeError` when the
   * record is read. `client_credentials` needs a client that authenticates, so not one whose `auth.method` is `none`.
   *
   * @defaultValue `["authorization_code"]`
   */
  readonly grantTypes?: readonly GrantType[];
  /** How this client authenticates to the token endpoint. */
  readonly auth: ClientAuthentication;
  /**
   * Where {@link Provider.endSession} may send the browser after logout, each compared byte for byte with the
   * requested `post_logout_redirect_uri`, and held to the same rules as `redirectUris`. Absent or empty, no logout
   * of this client redirects.
   */
  readonly postLogoutRedirectUris?: readonly string[];
}

/** A validated authorization request, saved between {@link Provider.beginAuthorization} and its completion. */
export interface InteractionRecord {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly state?: string;
  readonly nonce?: string;
  /** The PKCE `S256` challenge. */
  readonly codeChallenge: string;
  readonly prompt: readonly Prompt[];
  /** Requested `max_age`, in seconds. */
  readonly maxAge?: number;
  readonly loginHint?: string;
  readonly uiLocales?: readonly string[];
  /** When the request was validated, in seconds since the Unix epoch. */
  readonly createdAt: number;
  /** When the interaction expires, in seconds since the Unix epoch. */
  readonly expiresAt: number;
}

/** What an authorization code stands for. */
export interface CodeRecord {
  /** Identifies every token issued from this code, so they can be revoked together. */
  readonly grantId: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly nonce?: string;
  /** Granted scopes. */
  readonly scopes: readonly string[];
  readonly subject: string;
  /** When the user authenticated, in seconds since the Unix epoch. */
  readonly authTime: number;
  readonly amr?: readonly string[];
  readonly acr?: string;
  /** Whether the request carried `max_age`, which makes `auth_time` required in the ID token. */
  readonly maxAgeRequested: boolean;
  /** In seconds since the Unix epoch. */
  readonly expiresAt: number;
}

/** What an access token stands for. */
export interface AccessTokenRecord {
  readonly grantId: string;
  readonly clientId: string;
  readonly subject: string;
  readonly scopes: readonly string[];
  /** In seconds since the Unix epoch. */
  readonly expiresAt: number;
}

/** What a refresh token stands for. */
export interface RefreshTokenRecord {
  readonly grantId: string;
  readonly clientId: string;
  readonly subject: string;
  readonly scopes: readonly string[];
  readonly authTime: number;
  readonly amr?: readonly string[];
  readonly acr?: string;
  /** When the whole token family expires, in seconds since the Unix epoch. Rotation keeps it. */
  readonly expiresAt: number;
}

/** The outcome of consuming a single-use value. */
export type Consumption<TRecord> =
  /** This call consumed the value; no other call ever gets `consumed` for it. */
  | { readonly status: "consumed"; readonly record: TRecord }
  /** The value had already been consumed; its grant is named so the provider can revoke it. */
  | { readonly status: "replayed"; readonly grantId: string };

/**
 * Persistence the provider needs. The app implements it over its database; `@codenhub/oidc/testing` has
 * an in-memory reference, and `storeConformanceCases` there checks an adapter against this contract.
 *
 * Every key the provider passes for a code, token, or interaction is a SHA-256 digest of the value, never
 * the value itself, so a leaked store holds no usable code, token or interaction. A client record is different:
 * it may hold a `client_secret_jwt` HMAC key, which the provider needs in full, so a client record's credentials
 * still need protection. Interaction, code and token records are plain JSON; a client record may hold
 * `@codenhub/jwt` keys, which the app rebuilds from what it persists. Methods may throw or
 * reject on infrastructure failure; the provider lets that propagate rather than answering as if the
 * value were invalid.
 *
 * The `consume*` methods must be atomic: two concurrent calls for one key must never both get
 * `consumed`. A store without a compare-and-set or transaction, such as plain Cloudflare KV, cannot
 * implement them; use D1, a Durable Object, or a SQL transaction. The revocation check belongs to the same
 * atomic step: the store orders each consumption and each revocation of the same grant, and a consumption whose
 * atomic step runs after the revocation's must not return `consumed`.
 *
 * Each `save*` method must reject when its key already exists, and must never reset a used entry, which
 * would make a spent code or refresh token consumable again. The provider's keys are random digests, so
 * this happens only through an adapter bug.
 *
 * Expiry is the provider's to check: a method returns a record whatever its `expiresAt`. No method purges,
 * so the adapter deletes expired rows itself, such as with a scheduled job, keeping a used code or refresh
 * token at least until its `expiresAt`, so a replay is still recognized, and a revoked grant's marker until
 * the last token of that grant expires: `ttl.refreshToken` after the code exchange plus one `ttl.accessToken`, since an access token issued by the last refresh outlives its family.
 */
export interface OidcStore {
  /** Looks up a registered client. `undefined` when none has this identifier. */
  findClient(clientId: string): Promise<ClientRecord | undefined>;

  /** Saves a validated authorization request under a new key. */
  saveInteraction(key: string, record: InteractionRecord): Promise<void>;
  /** Atomically returns and deletes an interaction. `undefined` when it does not exist or was consumed. */
  consumeInteraction(key: string): Promise<InteractionRecord | undefined>;

  /** Saves a new authorization code. */
  saveCode(key: string, record: CodeRecord): Promise<void>;
  /**
   * Atomically marks a code used. The first call returns `consumed`; every later call returns `replayed`
   * until at least the record's `expiresAt`. `undefined` when the code was never saved or has been purged.
   */
  consumeCode(key: string): Promise<Consumption<CodeRecord> | undefined>;

  /** Saves a new access token. */
  saveAccessToken(key: string, record: AccessTokenRecord): Promise<void>;
  /** Returns an access token's record. `undefined` when it does not exist or its grant was revoked. */
  findAccessToken(key: string): Promise<AccessTokenRecord | undefined>;

  /** Saves a new refresh token. */
  saveRefreshToken(key: string, record: RefreshTokenRecord): Promise<void>;
  /**
   * Atomically marks a refresh token used, as {@link OidcStore.consumeCode} does for codes. `undefined`
   * when it does not exist or its grant was revoked.
   */
  consumeRefreshToken(key: string): Promise<Consumption<RefreshTokenRecord> | undefined>;

  /**
   * Revokes a grant: from now on, no access or refresh token of `grantId` is found or consumed, including
   * tokens saved after this call by a request that was already running.
   */
  revokeGrant(grantId: string): Promise<void>;
}

/** What the provider asks the app for when it releases claims about a user. */
export interface ClaimsRequest {
  readonly subject: string;
  readonly clientId: string;
  /** The granted scopes. */
  readonly scopes: readonly string[];
  /** The claim names those scopes release. Other returned claims are dropped. */
  readonly claims: readonly string[];
}

/** Token lifetimes, in seconds. */
export interface ProviderTtl {
  /**
   * Authorization codes. An integer from 1 through 600.
   *
   * @defaultValue 60
   */
  readonly code?: number;
  /**
   * Interactions between `beginAuthorization` and `completeAuthorization`. An integer from 60 through 86400.
   *
   * @defaultValue 1800
   */
  readonly interaction?: number;
  /**
   * Access tokens. An integer from 60 through 86400.
   *
   * @defaultValue 600
   */
  readonly accessToken?: number;
  /**
   * ID tokens. An integer from 60 through 86400.
   *
   * @defaultValue 600
   */
  readonly idToken?: number;
  /**
   * A refresh token family, counted from the code exchange; rotation does not extend it. An integer from
   * 60 through 31536000.
   *
   * @defaultValue 2592000 (30 days)
   */
  readonly refreshToken?: number;
}

/** How access tokens are issued. See {@link ProviderOptions.accessToken}. */
export type AccessTokenFormat =
  | { readonly format: "opaque" }
  /** `audience` is the `aud` every access token carries: the resource server's identifier, usually its URL. */
  | { readonly format: "jwt"; readonly audience: string };

/**
 * Endpoint URLs, each an absolute `https` URL on any origin. A default appends its path to the issuer without
 * the issuer's trailing `/`, so the issuer `https://id.example/` gives `https://id.example/token`.
 */
export interface ProviderEndpoints {
  /** @defaultValue `${issuer}/authorize` */
  readonly authorization?: string;
  /** @defaultValue `${issuer}/token` */
  readonly token?: string;
  /** @defaultValue `${issuer}/userinfo` */
  readonly userinfo?: string;
  /** @defaultValue `${issuer}/jwks` */
  readonly jwks?: string;
  /** Token revocation (RFC 7009). @defaultValue `${issuer}/revoke` */
  readonly revocation?: string;
  /**
   * RP-initiated logout. The app routes it and calls {@link Provider.endSession}, as it does for authorization.
   *
   * @defaultValue `${issuer}/logout`
   */
  readonly endSession?: string;
}

/**
 * Why the provider refused a request at the token, userinfo, or revocation endpoint. The client is sent only
 * the OAuth error code, so this is what an operator debugs with.
 */
export type ProviderDiagnosticReason =
  // The request, before the client is known
  | "content_type"
  | "body"
  | "parameters"
  // Client authentication
  | "client_credentials_missing"
  | "client_credentials_ambiguous"
  | "client_credentials_malformed"
  | "client_unknown"
  | "client_method_mismatch"
  | "client_credentials_wrong"
  // The token request
  | "grant_type_missing"
  | "grant_type_unsupported"
  | "grant_type_unauthorized"
  | "parameter_missing"
  | "code_verifier_malformed"
  | "code_unknown"
  | "code_replayed"
  | "code_expired"
  | "code_client_mismatch"
  | "redirect_uri_mismatch"
  | "code_verifier_mismatch"
  | "scope_invalid"
  | "refresh_token_unknown"
  | "refresh_token_replayed"
  | "refresh_token_expired"
  | "refresh_token_client_mismatch"
  | "scope_not_granted"
  // Userinfo
  | "access_token_missing"
  | "access_token_malformed"
  | "access_token_unknown"
  | "access_token_expired"
  | "access_token_without_openid"
  // Revocation
  | "token_missing"
  | "token_of_another_client";

/**
 * One refused request, for the operator's logs. It never holds a value the request carried: no token, code,
 * secret, verifier, or unverified client identifier.
 */
export interface ProviderDiagnostic {
  readonly endpoint: "token" | "userinfo" | "revocation";
  readonly reason: ProviderDiagnosticReason;
  /** The HTTP status the client was sent. */
  readonly status: number;
  /**
   * The client, when the provider knows it from the store: the authenticated client, the registered client
   * whose authentication failed, or the client a presented token belongs to. Absent when the request only
   * named a client.
   */
  readonly clientId?: string;
}

/** How {@link createProvider} runs. Invalid options throw `TypeError` at creation. */
export interface ProviderOptions {
  /**
   * The issuer identifier: an `https` URL of visible ASCII, with no query, fragment or credentials, used byte for
   * byte everywhere.
   */
  readonly issuer: string;
  /**
   * Key pairs from `generateKeyPair` or `importPrivateKey`/`importPublicKey`, each with a unique `kid`.
   * The first signs ID tokens; every public key is published, so a retiring key stays verifiable.
   *
   * Each pair's private and public keys must be the two halves of one key pair. Only their algorithm and
   * `kid` are checked, so a mismatched pair issues ID tokens nobody can verify. The keys must come from the
   * same `@codenhub/jwt` copy as this package's peer dependency: a key from another copy makes the JWKS
   * endpoint and token issuance reject.
   */
  readonly signingKeys: readonly KeyPair[];
  /** Where clients, codes, tokens, and interactions are kept. */
  readonly store: OidcStore;
  /**
   * Returns the claims about a user that the granted scopes release, for the userinfo endpoint. Claim
   * names outside `request.claims` and `sub` are dropped.
   */
  readonly claims: (
    request: ClaimsRequest,
  ) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;
  /**
   * Extra scopes and the claim names each releases, merged over the standard `profile`, `email`,
   * `address`, and `phone` scopes. Every scope a client requests must be here, standard, `openid`, or
   * `offline_access`.
   */
  readonly scopes?: Readonly<Record<string, readonly string[]>>;
  /** Token lifetimes. */
  readonly ttl?: ProviderTtl;
  /**
   * The format of access tokens. Opaque tokens are random values a resource server can check only through the
   * provider's store. JWT access tokens (RFC 9068) are signed with the first signing key, with `typ: at+jwt` and
   * this `audience`, so a resource server can verify them offline; such a server sees a revocation only when the
   * token expires. Either format is stored by its digest, so the userinfo and revocation endpoints work alike.
   *
   * @defaultValue `{ format: "opaque" }`
   */
  readonly accessToken?: AccessTokenFormat;
  /** Endpoint URLs. */
  readonly endpoints?: ProviderEndpoints;
  /**
   * Current time in milliseconds since the Unix epoch, for tests.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
  /**
   * Called with the reason each time the token, userinfo, or revocation endpoint refuses a request, after the
   * response is built and before `handle` resolves. The client only ever sees the OAuth error code, so this
   * is how an operator tells an expired code from a wrong verifier. Like the store and the `claims` callback,
   * an exception it throws makes `handle` reject. Authorization failures are not reported here, since
   * `beginAuthorization` and `completeAuthorization` already return their issues.
   *
   * A returned promise is awaited before the response is returned, so an async callback that rejects makes
   * `handle` reject with its error, as a synchronous throw does.
   */
  readonly onDiagnostic?: (diagnostic: ProviderDiagnostic) => void;
}

/**
 * An authorization request the app now handles: who the client is, and what it asked for. Frozen and
 * JSON-serializable. Keep the whole value for the login and consent pages; the provider has no lookup by `id`.
 */
export interface AuthorizationInteraction {
  /** Pass this to {@link Provider.completeAuthorization}. Keep it where the user's browser cannot swap it for another user's, such as the app's session. */
  readonly id: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  /**
   * `login` means authenticate again; `consent` means ask again; `none` means show nothing. The app performs the
   * login or consent step itself; the provider checks the outcome the app reports to
   * {@link Provider.completeAuthorization}, such as the `authTime` under `prompt=login`.
   */
  readonly prompt: readonly Prompt[];
  /** Maximum seconds since the user last authenticated. */
  readonly maxAge?: number;
  readonly loginHint?: string;
  readonly uiLocales?: readonly string[];
  /** When the request was validated, in seconds since the Unix epoch. A `prompt=login` login must happen at or after it. */
  readonly createdAt: number;
}

/** Why an authorization request failed, and how to answer it. */
export interface AuthorizationFailure extends OidcFailure {
  /**
   * A `302` to the client's verified redirect URI carrying the error, to return as is; or `null` when the
   * client or its redirect URI could not be verified, in which case the app must render its own error
   * page and must not redirect anywhere.
   */
  readonly redirect: Response | null;
}

/** A user the app authenticated, and what they granted. */
export interface AuthorizationGrant {
  readonly subject: string;
  /** When the user authenticated, in seconds since the Unix epoch. */
  readonly authTime: number;
  /** Granted scopes: a subset of the requested ones, including `openid`. */
  readonly scopes: readonly string[];
  /** Authentication methods, such as `["pwd", "otp"]` (RFC 8176). */
  readonly amr?: readonly string[];
  /** Authentication context class. */
  readonly acr?: string;
}

/** Why the app is not granting the request. Sent to the client as the OAuth error. */
export interface AuthorizationDenial {
  readonly error:
    | "access_denied"
    | "login_required"
    | "consent_required"
    | "interaction_required"
    | "account_selection_required";
}

/** OpenID Provider endpoints on the Fetch API. */
export interface Provider {
  /** The discovery document this provider publishes. */
  readonly metadata: ProviderMetadata;
  /**
   * Answers the discovery, JWKS, token, userinfo, and revocation endpoints.
   *
   * @returns The response, or `null` when the request is for none of those URLs. Never throws for any
   * request; rejects only when the store, the `claims` callback or `onDiagnostic` does, or with a
   * `TypeError` when the `claims` callback resolves to something that is not an object, the store returns
   * a malformed client record, or a token or revocation `POST`'s body was already read, such as by middleware
   * that parsed it. A signing key from another `@codenhub/jwt` copy also makes the JWKS endpoint and token
   * issuance reject; see {@link ProviderOptions.signingKeys}.
   */
  handle(request: Request): Promise<Response | null>;
  /**
   * Validates an authorization request and saves it as an interaction for the app's login and consent pages.
   *
   * @returns The interaction, or a failure whose `redirect` is the response to send, or `null` when the app
   * must render an error itself. Never throws for any request; rejects only when the store does, or with a
   * `TypeError` when the store returns a malformed client record or a `POST`'s body was already read.
   */
  beginAuthorization(request: Request): Promise<OidcResult<AuthorizationInteraction, AuthorizationFailure>>;
  /**
   * Finishes an interaction: issues a code, or sends the denial, as a `302` to the client's redirect URI.
   *
   * @returns The response, or `interaction_not_found` when the interaction does not exist, was already
   * completed, or expired.
   * @throws {TypeError} When `outcome` is malformed, such as an empty `subject`, `scopes` that is not an array of
   * strings, or a denial with other members; the interaction is left in place, so a corrected retry works. Also
   * when a well-formed grant does not fit the request: scopes outside the request or without `openid`, an
   * `authTime` before the interaction under `prompt=login`, an `authTime` in the future, or more than the
   * requested `max_age` before the request. The interaction is consumed before these checks, so after one of
   * these a retry gets `interaction_not_found` and the user must start over.
   */
  completeAuthorization(
    interactionId: string,
    outcome: AuthorizationGrant | AuthorizationDenial,
  ): Promise<OidcResult<Response>>;
  /**
   * Validates an RP-initiated logout request (RP-Initiated Logout 1.0) at the end-session endpoint, which the app
   * routes. The app then ends its own session, after asking the user to confirm when it chooses to, and answers
   * with `redirect`, or with its own page when `redirect` is `null`.
   *
   * @returns What the request names, or a failure for the app to render: `invalid_request` for a malformed
   * request or an `id_token_hint` issued to another client than `client_id`, `unknown_client`, or
   * `invalid_redirect_uri` with path `["post_logout_redirect_uri"]` for a URI the client did not register. A failure
   * never redirects. Never throws for any request; rejects only when the store does, or with a `TypeError` when
   * the store returns a malformed client record or a `POST`'s body was already read.
   */
  endSession(request: Request): Promise<OidcResult<EndSession>>;
}

/**
 * A validated logout request. Frozen. The provider keeps no sessions, so ending the user's session is the app's
 * work; this says who asked and where to send the browser afterwards.
 */
export interface EndSession {
  /**
   * The registered client that asked: `client_id`, or the client a verified `id_token_hint` was issued to. Absent
   * when that client is not registered in the store, when the hint names several audiences without a valid `azp`,
   * or when no client is named.
   */
  readonly clientId?: string;
  /**
   * The user a verified `id_token_hint` names. Absent without one, as when the hint has expired: then nothing ties
   * the request to a user, and the app should ask the user to confirm before it signs them out.
   */
  readonly subject?: string;
  /** `logout_hint`, passed through as sent. */
  readonly logoutHint?: string;
  /** `ui_locales`, with empty entries dropped. */
  readonly uiLocales?: readonly string[];
  /**
   * A `302` to the client's registered `post_logout_redirect_uri`, carrying `state`, or `null` when the request
   * named no URI.
   */
  readonly redirect: Response | null;
}
