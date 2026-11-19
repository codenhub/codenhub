import type { PrivateKey, SecretKey } from "@codenhub/jwt";

import type { IdTokenClaims, OidcResult, Prompt, ProviderMetadata, UserinfoClaims } from "../shared/types";

/**
 * How the client authenticates to the token endpoint (OpenID Connect Core §9).
 *
 * `none` is for public clients, such as single-page and native apps, which rely on PKCE alone.
 */
export type ClientAuth =
  | { readonly method: "none" }
  | { readonly method: "client_secret_basic"; readonly secret: string }
  | { readonly method: "client_secret_post"; readonly secret: string }
  /** An HS256 secret key from `importSecretKey`, which needs a secret of at least 32 bytes. */
  | {
      readonly method: "client_secret_jwt";
      readonly key: SecretKey;
      readonly audience?: AssertionAudience;
    }
  /** A private key whose public half the provider has registered for this client. */
  | {
      readonly method: "private_key_jwt";
      readonly key: PrivateKey;
      readonly audience?: AssertionAudience;
      /** Certificate thumbprints to put in the assertion's header, for a provider that finds the key by them. */
      readonly header?: AssertionHeader;
    };

/**
 * Header parameters a `private_key_jwt` assertion may carry beyond `alg` and the key's `kid`: the thumbprint of
 * the certificate the provider registered for the key (RFC 7515 §4.1.7 and §4.1.8), as the Microsoft identity
 * platform asks for a certificate credential. Each is base64url without padding, of the digest's bytes, not hex.
 */
export interface AssertionHeader {
  /** The certificate's SHA-1 thumbprint: 27 base64url characters. */
  readonly x5t?: string;
  /** The certificate's SHA-256 thumbprint: 43 base64url characters. */
  readonly "x5t#S256"?: string;
}

/**
 * What a client assertion names as its `aud`.
 *
 * - `issuer`: the provider's issuer identifier, which draft-ietf-oauth-rfc7523bis requires and this package's
 *   provider alone accepts. An assertion addressed to it cannot be replayed at a provider with another issuer.
 * - `token_endpoint`: the provider's token endpoint URL, for a provider that refuses the issuer, as some do. Use it
 *   only for such a provider: an authorization server whose metadata names another's token endpoint as its own
 *   could then replay the assertion there.
 *
 * @defaultValue `"issuer"`
 */
export type AssertionAudience = "issuer" | "token_endpoint";

/** Options of {@link discover}. */
export interface DiscoverOptions {
  /**
   * The `fetch` to call.
   *
   * @defaultValue `globalThis.fetch`, looked up at each call
   */
  readonly fetch?: typeof fetch;
  /**
   * Seconds to wait for the response before failing. An integer from 1 through 60.
   *
   * @defaultValue 5
   */
  readonly timeout?: number;
  /**
   * Accepts a document whose `issuer` is a template holding the literal `{tenantid}` where the requested issuer has
   * one path segment, as the Microsoft identity platform's multi-tenant `common` and `organizations` documents do.
   * Without it, `issuer` must equal the requested issuer exactly. A client made from such metadata needs
   * {@link ClientOptions.tenantIssuer}.
   *
   * @defaultValue false
   */
  readonly tenantIssuer?: boolean;
}

/**
 * Which tenants a client made from a `{tenantid}` issuer template accepts: `true` for any, or the `tid` values of
 * the tenants allowed to sign in.
 */
export type TenantIssuer = true | { readonly tenants: readonly string[] };

/** How {@link createClient} talks to one provider. Invalid options throw `TypeError` at creation. */
export interface ClientOptions {
  /**
   * The provider's metadata: what {@link discover} returned, or a document written by hand for a
   * provider without discovery. It is checked as strictly as a fetched one.
   */
  readonly metadata: ProviderMetadata;
  /** The client identifier the provider registered. */
  readonly clientId: string;
  /**
   * The redirect URI registered for this client, sent with every authorization request and code exchange.
   * Required to sign users in: {@link Client.authorize} and {@link Client.callback} throw `TypeError` without it.
   * A client that only calls {@link Client.clientCredentials} leaves it out.
   */
  readonly redirectUri?: string;
  /** How the client authenticates to the token endpoint. */
  readonly auth: ClientAuth;
  /**
   * The `fetch` to call for the token, userinfo, revocation, and JWKS endpoints.
   *
   * @defaultValue `globalThis.fetch`, looked up at each call
   */
  readonly fetch?: typeof fetch;
  /**
   * Seconds to wait for each response before failing. An integer from 1 through 60.
   *
   * @defaultValue 5
   */
  readonly timeout?: number;
  /**
   * Seconds of clock skew allowed on the ID token's `exp`, `iat`, and `auth_time`. An integer from 0
   * through 300. With 0, a provider whose clock runs a second ahead of this one makes sign-ins fail with
   * `issued_in_future`.
   *
   * @defaultValue 60
   */
  readonly clockTolerance?: number;
  /**
   * How this client receives back-channel logout (OpenID Connect Back-Channel Logout 1.0), as it registered it at
   * the provider. Only {@link Client.verifyLogoutToken} and {@link Client.readBackchannelLogout} read it.
   */
  readonly backchannelLogout?: {
    /**
     * Whether a logout token must carry `sid`, as a client registered with `backchannel_logout_session_required`
     * expects. When `true`, a token with only `sub` fails, so the app never ends every session of a user when it
     * asked to be told which one ended.
     *
     * @defaultValue false
     */
    readonly sessionRequired?: boolean;
  };
  /**
   * Current time in milliseconds since the Unix epoch, for tests.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
  /**
   * Whether the provider speaks OpenID Connect. `false` makes a plain OAuth 2.0 client; see {@link OAuthClientOptions}.
   *
   * @defaultValue true
   */
  readonly openid?: true;
  /**
   * Accepts the `{tenantid}` issuer template of a multi-tenant provider, such as the Microsoft identity platform's
   * `common` endpoint, which {@link DiscoverOptions.tenantIssuer} lets `discover` return. Each token's `iss` must
   * then equal the template with `{tenantid}` replaced by the token's own `tid` claim, a non-empty string of ASCII
   * letters, digits and `-`. `{ tenants }` also limits `tid` to the listed tenants. Required for such metadata,
   * and refused for any other. A client assertion then needs `auth.audience: "token_endpoint"`, since the template
   * names no one provider.
   *
   * @defaultValue none: the issuer matches exactly
   */
  readonly tenantIssuer?: TenantIssuer;
}

/**
 * Metadata for a plain OAuth 2.0 provider (RFC 8414 §2), such as GitHub, which publishes no discovery document and
 * issues no ID tokens. Usually written by hand.
 */
export interface OAuthMetadata {
  /**
   * The provider's issuer identifier: an `https` URL without query or fragment. For a provider that names none,
   * use the URL it is known by, such as `https://github.com`. An `iss` callback parameter (RFC 9207) must equal
   * it, and a client assertion names it as its audience unless `auth.audience` says otherwise.
   */
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  /** The endpoint {@link OAuthClient.userinfo} reads, such as GitHub's `https://api.github.com/user`. */
  readonly userinfo_endpoint?: string;
  readonly revocation_endpoint?: string;
  readonly end_session_endpoint?: string;
  /** When present, must include `code`. */
  readonly response_types_supported?: readonly string[];
  readonly response_modes_supported?: readonly string[];
  readonly grant_types_supported?: readonly string[];
  readonly scopes_supported?: readonly string[];
  readonly token_endpoint_auth_methods_supported?: readonly string[];
  readonly token_endpoint_auth_signing_alg_values_supported?: readonly string[];
  readonly revocation_endpoint_auth_methods_supported?: readonly string[];
  readonly revocation_endpoint_auth_signing_alg_values_supported?: readonly string[];
  /** When present, must include `S256`. */
  readonly code_challenge_methods_supported?: readonly string[];
  readonly authorization_response_iss_parameter_supported?: boolean;
  /** Any other metadata member, unused by this package. */
  readonly [member: string]: unknown;
}

/**
 * How {@link createClient} talks to a plain OAuth 2.0 provider, such as GitHub: the code flow with PKCE, and no ID
 * token. No `nonce` is sent, `openid` is neither required nor added, an `id_token` in a token response is ignored,
 * and userinfo returns the endpoint's JSON object as it is. Nothing identifies the user but what the app reads with
 * the access token.
 */
export interface OAuthClientOptions extends Omit<
  ClientOptions,
  "metadata" | "openid" | "backchannelLogout" | "tenantIssuer"
> {
  /** Must be `false`. */
  readonly openid: false;
  /** The provider's metadata. Checked as strictly as OpenID metadata, except for the OpenID-only members. */
  readonly metadata: OAuthMetadata;
}

/** What to ask for in one authorization request. */
export interface AuthorizeOptions {
  /**
   * Scopes to request. Must include `openid`.
   *
   * @defaultValue `["openid"]`
   */
  readonly scope?: readonly string[];
  /** Whether the provider must, or must not, show its login and consent pages. `none` stands alone. */
  readonly prompt?: readonly Prompt[];
  /**
   * Maximum seconds between the user's last authentication and this request. When set, the ID token must carry
   * `auth_time`. `0` asks the user to authenticate again, as `prompt: ["login"]` does.
   */
  readonly maxAge?: number;
  /** A hint about the account to sign in with, such as an email address. */
  readonly loginHint?: string;
  /** Preferred languages for the provider's pages, as BCP 47 tags. */
  readonly uiLocales?: readonly string[];
  /**
   * The resource servers the tokens are for (RFC 8707), as absolute URIs without a fragment, such as
   * `https://api.example`. The provider must allow each for this client. A refresh may narrow them with
   * {@link RefreshOptions.resource}, but never widen them.
   */
  readonly resource?: readonly string[];
  /** Authentication context classes to ask for, most preferred first (`acr_values`). Each has no spaces. */
  readonly acrValues?: readonly string[];
  /** How the provider shows its pages. */
  readonly display?: "page" | "popup" | "touch" | "wap";
  /**
   * An ID token the provider issued this client earlier, as a hint about who is signing in (`id_token_hint`). It has
   * no length cap of its own, only the 8192-character limit of the URL.
   */
  readonly idTokenHint?: string;
  /** Preferred languages for the claims the provider returns, as BCP 47 tags (`claims_locales`). */
  readonly claimsLocales?: readonly string[];
  /**
   * Individual claims to request (OpenID Connect Core §5.5), as a plain JSON object, sent JSON-encoded as `claims`.
   * At most 4096 characters once encoded.
   */
  readonly claims?: Readonly<Record<string, unknown>>;
  /**
   * How the provider returns the response (OAuth 2.0 Multiple Response Type Encoding Practices and Form Post
   * Response Mode). `form_post` makes the browser `POST` it to the redirect URI, as Sign in with Apple requires
   * for the `name` and `email` scopes; pass that request to {@link Client.callback}.
   *
   * @defaultValue `"query"`, which sends no `response_mode`
   */
  readonly responseMode?: ResponseMode;
  /**
   * Other parameters to send, for a provider-specific option such as Google's `access_type` and `hd` or the
   * Microsoft identity platform's `domain_hint`. Each name and value is a non-empty string of well-formed Unicode
   * of at most 4096 characters. A name the client sets itself, or one an option above covers, throws `TypeError`.
   */
  readonly extraParameters?: Readonly<Record<string, string>>;
}

/** Where the provider puts the authorization response: the redirect URI's query, or a form it posts there. */
export type ResponseMode = "query" | "form_post";

/** What to ask for in one authorization request to a plain OAuth 2.0 provider. */
export interface OAuthAuthorizeOptions extends Omit<
  AuthorizeOptions,
  "scope" | "maxAge" | "idTokenHint" | "acrValues" | "claims" | "claimsLocales"
> {
  /**
   * Scopes to request, any scope tokens the provider defines. `openid` is neither required nor added.
   *
   * @defaultValue none sent: the provider's default
   */
  readonly scope?: readonly string[];
}

/**
 * What the app keeps between the authorization request and its callback, typically in a server-side
 * session or an encrypted, `HttpOnly` cookie. Plain JSON: it survives `JSON.stringify` and
 * `structuredClone` unchanged. It holds the PKCE verifier, so treat it as a secret.
 */
export interface PendingAuthorization {
  readonly state: string;
  /** The nonce the ID token must carry. Absent for a client created with `openid: false`. */
  readonly nonce?: string;
  readonly codeVerifier: string;
  /** The `max_age` that was requested, in seconds, when one was. */
  readonly maxAge?: number;
  /** When the request was made, in seconds since the Unix epoch. Present exactly when `maxAge` is. */
  readonly requestedAt?: number;
  /** `form_post` when the response was asked for as a form post. Absent for the `query` default. */
  readonly responseMode?: "form_post";
}

/**
 * What {@link Client.callback} reads the authorization response from: the URL the provider redirected the browser
 * to, as a string or a `URL`, or the incoming request itself. A `form_post` response is only in a request's body.
 */
export type CallbackInput = string | URL | Request;

/** A started authorization: where to send the user, and what to keep for the callback. */
export interface AuthorizationStart {
  /** The authorization request URL to redirect the user's browser to. */
  readonly url: string;
  /** What {@link Client.callback} needs to finish this request. */
  readonly pending: PendingAuthorization;
}

/** Tokens the provider issued. Frozen. */
export interface TokenSet {
  readonly accessToken: string;
  readonly tokenType: "Bearer";
  /** When the access token expires, in seconds since the Unix epoch, when the provider said. */
  readonly expiresAt?: number;
  readonly refreshToken?: string;
  /** The compact ID token. Always present after a callback; present after a refresh when the provider sent one. */
  readonly idToken?: string;
  /**
   * The granted scopes, as the provider reported them. Absent when the provider left `scope` out, which
   * RFC 6749 §5.1 allows only when they equal the requested ones.
   */
  readonly scope?: readonly string[];
}

/** A completed sign-in. Frozen. */
export interface SignIn {
  /** The validated ID token's claims. */
  readonly claims: IdTokenClaims;
  /** The tokens, with `idToken` always present. */
  readonly tokens: TokenSet & { readonly idToken: string };
  /**
   * The authorization response's parameters the client did not read, such as Sign in with Apple's `user` or the
   * Microsoft identity platform's `session_state`. The provider's browser redirect carried them, so nothing
   * vouches for them: treat each as the user's own input.
   */
  readonly parameters: Readonly<Record<string, string>>;
}

/** A completed sign-in with a plain OAuth 2.0 provider: tokens, and no claims. Frozen. */
export interface OAuthSignIn {
  /** The tokens. An `id_token` in the response is ignored, so `idToken` is never present. */
  readonly tokens: TokenSet;
  /** As {@link SignIn.parameters}. */
  readonly parameters: Readonly<Record<string, string>>;
}

/** A completed refresh. Frozen. */
export interface Refreshed {
  readonly tokens: TokenSet;
  /** The new ID token's claims, when the provider sent one. */
  readonly claims?: IdTokenClaims;
}

/** The claims of the ID token a refresh continues, which a new ID token must agree with. */
export type PreviousIdToken = Pick<IdTokenClaims, "iss" | "sub" | "aud" | "azp" | "auth_time" | "nonce">;

/** What to refresh. */
export interface RefreshOptions {
  /**
   * The refresh token to exchange. A refresh response may omit `refresh_token`; then the old one stays valid
   * and the app keeps using it (RFC 6749 §6), so only a new `tokens.refreshToken` replaces it.
   */
  readonly refreshToken: string;
  /**
   * The claims of the sign-in's ID token, `signIn.claims`, or of a later refresh's. When the provider sends a new ID
   * token, it must agree with them as OpenID Connect Core §12.2 requires: the same `iss`, `sub` and `aud`, the same
   * `azp` or none when they had none, the same `auth_time` when both carry one, and the same `nonce` when it
   * carries one.
   */
  readonly previous: PreviousIdToken;
  /** A narrower set of scopes to request. Must be within the original grant. */
  readonly scope?: readonly string[];
  /**
   * The resource servers the new access token is for (RFC 8707), as absolute URIs without a fragment. Each must be
   * one the sign-in asked for with {@link AuthorizeOptions.resource}. Without it, this package's provider issues the
   * token for every resource of the sign-in that the client's registration still lists.
   */
  readonly resource?: readonly string[];
}

/** What to refresh with a plain OAuth 2.0 provider. There is no ID token to continue. */
export type OAuthRefreshOptions = Omit<RefreshOptions, "previous">;

/** A completed refresh with a plain OAuth 2.0 provider. Frozen. */
export interface OAuthRefreshed {
  /** The tokens. An `id_token` in the response is ignored, so `idToken` is never present. */
  readonly tokens: TokenSet;
}

/** What {@link Client.clientCredentials} asks for. */
export interface ClientCredentialsOptions {
  /**
   * Scopes to request. Without it, the provider decides; this package's provider grants every scope the client
   * is registered for that it defines, other than `openid` and `offline_access`. A registered scope it does not
   * define is dropped.
   */
  readonly scope?: readonly string[];
  /**
   * The resource servers the access token is for (RFC 8707), as absolute URIs without a fragment. The provider must
   * allow each for this client. Without it, this package's provider gives a JWT access token its default audience.
   */
  readonly resource?: readonly string[];
}

/** What {@link Client.endSessionUrl} puts in the logout request. Every member is optional. */
export interface EndSessionOptions {
  /**
   * The ID token of the sign-in being ended. Recommended: it tells the provider which user is leaving, so it can
   * skip asking them to confirm. An expired one is sent as well; this package's provider accepts it when it is otherwise valid.
   */
  readonly idTokenHint?: string;
  /** Where the provider sends the browser afterwards. Must be registered for this client at the provider. */
  readonly postLogoutRedirectUri?: string;
  /** Returned unchanged to `postLogoutRedirectUri`, for the app to match the response to its request. */
  readonly state?: string;
  /** A hint about the account being signed out, such as an email address. */
  readonly logoutHint?: string;
  /** Preferred languages for the provider's logout page, as BCP 47 tags. */
  readonly uiLocales?: readonly string[];
}

/** What {@link Client.revoke} revokes. */
export interface RevokeOptions {
  /** The access or refresh token to revoke. */
  readonly token: string;
  /** Which kind of token it is, a hint the provider may use to find it faster (RFC 7009 §2.1). */
  readonly tokenTypeHint?: "access_token" | "refresh_token";
}

/**
 * A verified back-channel logout: the provider says a session of the user ended. Frozen. At least one of `subject`
 * and `sessionId` is present, and `sessionId` always is when the client set `backchannelLogout.sessionRequired`.
 *
 * End every session the app holds that matches: with `sessionId`, the session it signed in with that `sid`; with
 * only `subject`, every session of that user from this provider.
 */
export interface BackchannelLogout {
  /** The token's `sub`: the user, as the ID tokens of this provider name them. */
  readonly subject?: string;
  /** The token's `sid`: the provider's session, as the `sid` claim of the ID tokens issued during it. */
  readonly sessionId?: string;
  /**
   * The token's `jti`. The client stores nothing, so it accepts the same token again until it expires. To refuse a
   * replay, as §2.6 suggests, remember each `jti` until `expiresAt` plus the client's `clockTolerance`, and refuse
   * one seen before.
   */
  readonly jti: string;
  /** The token's `iat`, in seconds since the Unix epoch. */
  readonly issuedAt: number;
  /** The token's `exp`, in seconds since the Unix epoch. The client accepts it until `clockTolerance` after. */
  readonly expiresAt: number;
}

/** What to ask the userinfo endpoint. */
export interface UserinfoOptions {
  readonly accessToken: string;
  /** The `sub` of the ID token. The response's `sub` must equal it (OpenID Connect Core §5.3.2). */
  readonly subject: string;
}

/** What to ask a plain OAuth 2.0 provider's user endpoint. There is no ID token whose `sub` to compare. */
export type OAuthUserinfoOptions = Omit<UserinfoOptions, "subject">;

/**
 * A relying party for one provider and one registered client. It holds no per-user state: everything a
 * sign-in needs between redirect and callback is in the {@link PendingAuthorization} the app keeps.
 */
export interface Client {
  /** The provider metadata the client was created with. */
  readonly metadata: ProviderMetadata;
  /**
   * Starts an authorization code flow with PKCE `S256`, a fresh `state`, and a fresh `nonce`.
   *
   * @throws {TypeError} When `options` are invalid, such as a scope list without `openid`.
   */
  authorize(options?: AuthorizeOptions): Promise<AuthorizationStart>;
  /**
   * Finishes a sign-in from the provider's authorization response: checks `state` and `iss`, exchanges the code,
   * and validates the ID token.
   *
   * @remarks
   * `input` is the URL the browser was redirected to, or the incoming request. A `GET` request is read by its URL.
   * A `POST` is a `form_post` response, read from its body, which must be `application/x-www-form-urlencoded` UTF-8
   * of at most 16384 bytes, under the same parameter rules as a query. A `pending` made with `responseMode:
   * "form_post"` is completed only from such a `POST`, and any other only from a URL or a `GET`; otherwise the result
   * is `invalid_callback`.
   *
   * @returns The validated claims and tokens, and the response's other parameters, or every issue found. Never
   * throws for any URL, request or response.
   * @throws {TypeError} When `input` is not a string, a `URL` or a `Request`, the URL is relative, `pending` is
   * malformed, or the request's body was already read.
   */
  callback(input: CallbackInput, pending: PendingAuthorization): Promise<OidcResult<SignIn>>;
  /**
   * Exchanges a refresh token for new tokens. The provider may rotate refresh tokens: when `tokens.refreshToken`
   * is present, store it in place of the old one. When it is absent, keep the old refresh token, which stays
   * valid (RFC 6749 §6).
   *
   * When the response carries an ID token that fails validation, the result is a failure and the new tokens
   * are not returned: a response with an ID token that cannot be trusted is not trusted at all. The provider
   * has already spent the refresh token that was sent, so the session cannot be refreshed again; sign the
   * user in again.
   *
   * @returns The new tokens, or every issue found. Never throws for any response.
   * @throws {TypeError} When `options` is invalid, such as an empty `refreshToken`, a `previous` without the
   * `iss`, `sub` and `aud` of an ID token, a scope list that is not
   * a non-empty array of scope tokens, or a `resource` that is not a non-empty array of at most 20 absolute URIs
   * without a fragment. The message names the option and never its value.
   */
  refresh(options: RefreshOptions): Promise<OidcResult<Refreshed>>;
  /**
   * Fetches the user's claims from the userinfo endpoint. The access token must be granted `openid`, so one from
   * {@link Client.clientCredentials}, which has no user, gets an issue instead: this package's provider answers
   * it with `403 insufficient_scope`.
   *
   * A response signed as a JWT (`application/jwt`, OpenID Connect Core §5.3.2) is verified with the ID token's key
   * set and algorithms. Its `iss` and `aud`, when present, must be the issuer and include this client, and its
   * `sub` is checked as a JSON response's is. An encrypted (JWE) response is `invalid_userinfo` with
   * `params.reason` of `encrypted`, since this package decrypts nothing.
   *
   * @returns The claims, or every issue found. Never throws for any response; it rejects only for the caller
   * errors listed below.
   * @throws {TypeError} When the provider metadata has no userinfo_endpoint, or an option is invalid.
   */
  userinfo(options: UserinfoOptions): Promise<OidcResult<UserinfoClaims>>;
  /**
   * Revokes an access or refresh token at the provider's revocation endpoint (RFC 7009), as when the user
   * signs out. Providers such as this package's revoke every token of the sign-in along with it.
   *
   * @returns Success when the provider answered `200`, which it also does for a token that was unknown or
   * already revoked, or every issue found. Never throws for any response; it rejects only for the caller
   * errors listed below.
   * @throws {TypeError} When the provider metadata has no revocation_endpoint, or an option is invalid.
   */
  revoke(options: RevokeOptions): Promise<OidcResult<void>>;
  /**
   * Gets an access token for the client itself, with no user, through the `client_credentials` grant (RFC 6749
   * §4.4), as a service calling an API does. No ID token or refresh token is involved: when the access token
   * expires, call it again.
   *
   * @returns The tokens, or every issue found. An `id_token` or `refresh_token` in the response is dropped: nothing
   * checks the one, and RFC 6749 §4.4.3 says the other SHOULD NOT be included.
   * Never throws for any response; it rejects only for the caller errors listed below.
   * @throws {TypeError} When the client authenticates with `none`, when the provider metadata lists
   * grant_types_supported without client_credentials, when `scope` is given but is not a non-empty array of at
   * most 100 scope tokens, or when `resource` is given but is not a non-empty array of at most 20 absolute URIs
   * without a fragment.
   */
  clientCredentials(options?: ClientCredentialsOptions): Promise<OidcResult<TokenSet>>;
  /**
   * Builds the URL to send the browser to so the provider ends the user's session there (RP-Initiated Logout 1.0).
   * Revoke the tokens and end the app's own session as well: logging out at the provider does neither.
   *
   * @returns The logout request URL, with `client_id` always included.
   * @throws {TypeError} When the provider metadata has no end_session_endpoint, an option is invalid, or the URL
   * would be longer than 8192 characters.
   */
  endSessionUrl(options?: EndSessionOptions): string;
  /**
   * Verifies a logout token the provider sent to this client's back-channel logout URI (OpenID Connect Back-Channel
   * Logout 1.0 §2.6), for an app that has already read the request's form body itself. Prefer
   * {@link Client.readBackchannelLogout}, which also checks the request.
   *
   * @remarks
   * The signature must verify against the provider's JWKS with an algorithm accepted for ID tokens, and the header
   * must have `typ: "logout+jwt"`, so an ID token or an access token never passes. `iss` must be the issuer, `aud`
   * must include the client (with `azp` checked as for ID tokens), `iat`, `exp` and `jti` must be present, and `exp`
   * and `iat` are checked with the client's `clockTolerance`. `events` must hold the back-channel logout event with
   * an object value, the token must name `sub`, `sid` or both, `sid` is required when
   * {@link ClientOptions.backchannelLogout} says so, and a `nonce` fails it. Every problem found is returned.
   *
   * The client stores nothing, so it does not refuse a replayed token; see {@link BackchannelLogout.jti}.
   *
   * @param logoutToken - The compact logout token, the `logout_token` form parameter.
   * @returns Who signed out, or every issue found, as `invalid_logout_token` (or `azp_mismatch`) issues whose
   * `params.jwtCode` names the check. Never throws for any token.
   * @throws {TypeError} When `logoutToken` is not a string.
   */
  verifyLogoutToken(logoutToken: string): Promise<OidcResult<BackchannelLogout>>;
  /**
   * Reads a back-channel logout request the provider sent to this client (OpenID Connect Back-Channel Logout 1.0
   * §2.5) and verifies its logout token as {@link Client.verifyLogoutToken} does.
   *
   * @remarks
   * The request must be a `POST` with `Content-Type: application/x-www-form-urlencoded` (a `charset` other than
   * UTF-8 is refused), a body of at most 16384 bytes, and exactly one non-empty `logout_token`. Other parameters
   * are ignored. A request that fails any of these is an `invalid_logout_request` issue whose path names the part
   * at fault; the token is not verified.
   *
   * Answer `200` on success and `400` on failure, both with `Cache-Control: no-store` (§2.8). A `400` may carry
   * a JSON body `{ "error": "invalid_request" }`; never echo the token or the issues' details to the sender.
   *
   * @param request - The incoming request, before anything has read its body.
   * @returns Who signed out, or every issue found. Never throws for any request a sender can make.
   * @throws {TypeError} When the request's body was already read, which is a bug in the calling code, such as
   * middleware that parsed the form first.
   */
  readBackchannelLogout(request: Request): Promise<OidcResult<BackchannelLogout>>;
}

/**
 * A client for a plain OAuth 2.0 provider, from {@link createClient} with `openid: false`. It signs users in with
 * the code flow and PKCE, as {@link Client} does, but there is no ID token, so nothing it returns says who the user
 * is: read that with the access token, such as through {@link OAuthClient.userinfo}.
 */
export interface OAuthClient {
  /** The provider metadata the client was created with. */
  readonly metadata: OAuthMetadata;
  /**
   * Starts an authorization code flow with PKCE `S256` and a fresh `state`. No `nonce` is sent.
   *
   * @throws {TypeError} When `options` are invalid.
   */
  authorize(options?: OAuthAuthorizeOptions): Promise<AuthorizationStart>;
  /**
   * Finishes a sign-in as {@link Client.callback} does, without an ID token: an `id_token` in the token response is
   * ignored.
   *
   * @returns The tokens and the response's other parameters, or every issue found. Never throws for any URL,
   * request or response.
   * @throws {TypeError} As {@link Client.callback}.
   */
  callback(input: CallbackInput, pending: PendingAuthorization): Promise<OidcResult<OAuthSignIn>>;
  /**
   * Exchanges a refresh token for new tokens, as {@link Client.refresh} does, without an ID token.
   *
   * @returns The new tokens, or every issue found. Never throws for any response.
   * @throws {TypeError} When `options` is invalid.
   */
  refresh(options: OAuthRefreshOptions): Promise<OidcResult<OAuthRefreshed>>;
  /**
   * Fetches the metadata's `userinfo_endpoint` with the access token as a `Bearer` credential and returns the JSON
   * object it answers, as it is: nothing is compared, since there is no ID token.
   *
   * @returns The frozen object, or every issue found. Never throws for any response.
   * @throws {TypeError} When the metadata has no userinfo_endpoint, or an option is invalid.
   */
  userinfo(options: OAuthUserinfoOptions): Promise<OidcResult<Readonly<Record<string, unknown>>>>;
  /** As {@link Client.revoke}. */
  revoke(options: RevokeOptions): Promise<OidcResult<void>>;
  /** As {@link Client.clientCredentials}. */
  clientCredentials(options?: ClientCredentialsOptions): Promise<OidcResult<TokenSet>>;
  /** As {@link Client.endSessionUrl}. */
  endSessionUrl(options?: EndSessionOptions): string;
}
