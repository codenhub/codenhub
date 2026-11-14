import type { AsymmetricAlgorithm, KeyPair, KeySet, SecretKey } from "@codenhub/jwt";

import type { OidcFailure, OidcResult, Prompt, ProviderMetadata } from "../shared/types";

/**
 * How a registered client authenticates to the token endpoint, and what the provider checks it against.
 *
 * Secrets are never stored in plaintext: each entry of `secretHashes` is what {@link hashClientSecret} returns
 * for a secret {@link generateClientSecret} created. `client_secret_jwt` is the exception, because an HMAC
 * can only be checked with the secret itself.
 *
 * `secretHashes` lists every secret the client may use, and a presented secret authenticates when it matches any
 * of them, so a secret can be rotated without downtime: add the new hash, roll the new secret out to the
 * client, then remove the old hash. The list must be non-empty and each entry a non-empty string, or the
 * provider throws `TypeError` when it reads the record.
 *
 * A remote key set given as `keys` must be one object per client, reused across `findClient` calls: its cache and
 * its limit on fetches live in the object, so a new one for each read lets every token request that presents an
 * assertion for that client make the provider fetch the client's JWKS.
 */
export type ClientAuthentication =
  | { readonly method: "none" }
  | { readonly method: "client_secret_basic"; readonly secretHashes: readonly string[] }
  | { readonly method: "client_secret_post"; readonly secretHashes: readonly string[] }
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
   *
   * A scope listed here need not be defined in {@link ProviderOptions.scopes}: one that is not is accepted at
   * authorization, in a refresh `scope` and by `client_credentials`, and releases no claims.
   *
   * A refresh issues only the family's scopes this list still holds, so removing a scope from it takes effect on
   * the client's next refresh, and listing it again restores it on the one after; the family itself keeps its scopes.
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
  /**
   * Token lifetimes for this client, each replacing the provider's {@link ProviderOptions.ttl} of the same name for
   * the tokens issued to it. A lifetime left out is the provider's. The provider checks each value when it reads
   * the record, by the bounds of the option it replaces, and throws `TypeError` if one fails.
   */
  readonly ttl?: ClientTtl;
  /**
   * The algorithm of the signing key that signs this client's ID tokens: the provider uses the first of
   * {@link ProviderOptions.signingKeys} with that algorithm. A value that is not a supported asymmetric algorithm,
   * or that none of the signing keys has, throws `TypeError` when the record is read.
   *
   * Without it, ID tokens are signed with the first `RS256` key when there is one, and otherwise the first key,
   * since OpenID Connect Core §15.1 requires every provider to support `RS256` and OpenID Connect Registration
   * makes it the default for a client that registers no algorithm. JWT access tokens are signed with the first
   * key whatever this says.
   */
  readonly idTokenSigningAlg?: AsymmetricAlgorithm;
  /**
   * Whether an authorization request from this client must carry a PKCE `S256` challenge (RFC 7636). A challenge
   * that is sent is always checked, whatever this says: only `S256` is accepted, and the token request must carry
   * the matching `code_verifier`.
   *
   * `false` is for a confidential client of a relying-party library that sends no PKCE, and asserts that the client
   * checks the `nonce` of the ID token (OAuth 2.1 §7.5.1.1, RFC 9700 §2.1.1). Such a client may leave the challenge
   * out, but then must send a `nonce`, or the request fails with `invalid_request`. A code issued without a
   * challenge refuses a token request that carries a `code_verifier`, so an attacker cannot downgrade a code that
   * was bound to a challenge. A public client, whose `auth.method` is `none`, cannot turn this off: the record
   * throws `TypeError` when read.
   *
   * @defaultValue `true`
   */
  readonly requirePkce?: boolean;
  /**
   * Where {@link Provider.backchannelLogout} sends this client its logout token (OpenID Connect Back-Channel Logout
   * 1.0 §2.2), and whether it needs the session. Absent, the client has no back-channel logout and the method has
   * nothing to send. The provider checks it when it reads the record and throws `TypeError` if it is malformed.
   */
  readonly backchannelLogout?: {
    /**
     * The client's `backchannel_logout_uri`: an absolute `https` URL of visible ASCII, without a fragment or
     * credentials. It is called by the app's server, not by a browser, so it is held to the rule of every
     * server-to-server URL, which is `https`.
     */
    readonly uri: string;
    /**
     * Whether the client needs `sid` in the logout token (`backchannel_logout_session_required`). When `true`,
     * {@link Provider.backchannelLogout} throws `TypeError` for a request without a `sessionId`.
     *
     * @defaultValue `false`
     */
    readonly sessionRequired?: boolean;
  };
  /**
   * Whether every ID token issued to this client also carries the claims its granted scopes release, as userinfo
   * returns them, for relying parties that read only the ID token and never call userinfo: Kubernetes' API server
   * OIDC authenticator, and many "Sign in with" integrations that expect `email` there. It covers the code
   * exchange and every refresh, for the scopes that token response grants. The claims come from the same
   * {@link ProviderOptions.claims} callback and are filtered the same way; userinfo itself is unchanged. The
   * `client_credentials` grant issues no ID token.
   *
   * A claim named `iss`, `sub`, `aud`, `exp`, `iat`, `auth_time`, `nonce`, `acr`, `amr`, `azp`, `at_hash`, `c_hash`,
   * `sid`, `jti`, `nbf`, `events` or `cnf` is dropped from what the callback returns, so the protocol claims are always the provider's.
   * The provider checks the value when it reads the record, and throws `TypeError` if it is not a boolean.
   *
   * Turning it on puts personal data in a token that the client may log, store in a cookie, or pass to other
   * services, where userinfo would have held it behind an access token. Enable it only for a client that needs it,
   * and keep the scopes of that client to the ones it uses.
   *
   * @defaultValue `false`
   */
  readonly idTokenClaims?: boolean;
  /**
   * The resource servers this client may ask for tokens to (RFC 8707): each an absolute URI without a fragment, of
   * visible ASCII, such as `https://api.example.com`. A `resource` parameter at authorization or at the token
   * endpoint must name one of them, or the request fails with `invalid_target`. An access token issued for one or
   * more resources carries them as its audience, which {@link Provider.authenticate} checks and which a JWT access
   * token puts in `aud`. Absent or empty, the client may name none, and its tokens keep the default audience. The
   * provider checks the list when it reads the record, and throws `TypeError` if it is malformed.
   */
  readonly resources?: readonly string[];
}

/** How the client asks the app to show its pages (OpenID Connect Core §3.1.2.1). */
export type Display = "page" | "popup" | "touch" | "wap";

/** A validated authorization request, saved between {@link Provider.beginAuthorization} and its completion. */
export interface InteractionRecord {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly state?: string;
  readonly nonce?: string;
  /** The PKCE `S256` challenge; absent only when the client has `requirePkce: false` and sent none. */
  readonly codeChallenge?: string;
  readonly prompt: readonly Prompt[];
  /** Requested `max_age`, in seconds. */
  readonly maxAge?: number;
  readonly loginHint?: string;
  readonly uiLocales?: readonly string[];
  /** Requested `acr_values`, in the order the client preferred them. */
  readonly acrValues?: readonly string[];
  readonly claimsLocales?: readonly string[];
  readonly display?: Display;
  /** The `resource` values the client asked for (RFC 8707), each one of the client's `resources`. */
  readonly resources?: readonly string[];
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
  /** The PKCE `S256` challenge the code is bound to; absent when the request sent none. */
  readonly codeChallenge?: string;
  readonly nonce?: string;
  /** Granted scopes. */
  readonly scopes: readonly string[];
  readonly subject: string;
  /** When the user authenticated, in seconds since the Unix epoch. */
  readonly authTime: number;
  readonly amr?: readonly string[];
  readonly acr?: string;
  /** The app's session identifier from the grant, carried to every token of the grant. */
  readonly sessionId?: string;
  /** Whether the request carried `max_age`, which makes `auth_time` required in the ID token. */
  readonly maxAgeRequested: boolean;
  /** The resource servers the grant covers (RFC 8707): the authorization request's `resource` values. */
  readonly resources?: readonly string[];
  /** In seconds since the Unix epoch. */
  readonly expiresAt: number;
}

/** What an access token stands for. */
export interface AccessTokenRecord {
  readonly grantId: string;
  readonly clientId: string;
  readonly subject: string;
  readonly scopes: readonly string[];
  /** The app's session identifier from the grant. */
  readonly sessionId?: string;
  /**
   * The resource servers the token is for: the token request's `resource` values, else the grant's (at a refresh,
   * those the client's record still lists), else, for a JWT access token, the `accessToken.audience` option. Absent
   * for an opaque token issued for no resource.
   */
  readonly audience?: readonly string[];
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
  /** The app's session identifier from the grant. Rotation keeps it. */
  readonly sessionId?: string;
  /** The resource servers the family covers (RFC 8707), from the authorization request. Rotation keeps it. */
  readonly resources?: readonly string[];
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
 * the last token of that grant expires: a refresh token lifetime after the code exchange plus one access token
 * lifetime, since an access token issued by the last refresh outlives its family. Lifetimes can differ by client
 * ({@link ClientRecord.ttl}), so keep the marker for the longest refresh token lifetime of any client plus the
 * longest access token lifetime of any client, the provider's own `ttl` counting for a client that sets none.
 * Count a lifetime since lowered too, until the tokens issued under it have expired: a family keeps the expiry
 * it got at the code exchange, and an access token keeps its own.
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

/**
 * The token lifetimes a client's record may set for itself, in seconds. Each has the type, range and meaning of the
 * {@link ProviderTtl} member of the same name, and a lifetime left out falls back to the provider's. The
 * `interaction` lifetime is not here: an interaction exists before the app completes it, and stays provider-wide.
 */
export interface ClientTtl {
  /** Authorization codes issued to the client. An integer from 1 through 600. */
  readonly code?: number;
  /** Access tokens issued to the client, and the `expires_in` it is told. An integer from 60 through 86400. */
  readonly accessToken?: number;
  /** ID tokens issued to the client. An integer from 60 through 86400. */
  readonly idToken?: number;
  /**
   * A refresh token family of the client, counted from the code exchange; rotation does not extend it. An integer
   * from 60 through 31536000.
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
  | "code_verifier_missing"
  | "code_verifier_unexpected"
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
  | "refresh_refused"
  | "resource_invalid"
  | "resource_not_granted"
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
   * A client's ID tokens are signed with the first key of the algorithm its `idTokenSigningAlg` names, or without
   * one with the first `RS256` key when there is one and otherwise the first key. The first key signs JWT access
   * tokens. Every public key is published, so a retiring key stays verifiable.
   *
   * Each pair's private and public keys must be the two halves of one key pair. Only their algorithm and
   * `kid` are checked, so a mismatched pair issues ID tokens nobody can verify. The keys must come from the
   * same `@codenhub/jwt` copy as this package's peer dependency: a key from another copy makes the JWKS
   * endpoint reject, and any token response that signs an ID token or a JWT access token. An opaque access
   * token from the client-credentials grant signs nothing, so it is still issued.
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
   * `address`, and `phone` scopes. What a client may request is what its {@link ClientRecord.scopes} lists: a scope
   * the record lists and this option does not define is accepted, and releases no claims, so an app-defined scope
   * such as `data:<namespace>:read` can live only in the database. A scope must still be a scope token
   * (RFC 6749 §3.3). Discovery's `scopes_supported` lists only the scopes this option and the standard ones define.
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
  /**
   * Asked before each refresh issues tokens, so the app can end a family whose user is no longer entitled to it: a
   * user who is disabled, loses a role, or revokes consent otherwise keeps refreshing until the family expires
   * (`ttl.refreshToken`, 30 days by default). It also covers the app's session revocation, since the grant's
   * `sessionId` is passed.
   *
   * It runs after the refresh token is consumed and every check on it passes, just before tokens are issued.
   * `true` issues as it would without this option. `false` answers `invalid_grant`, revokes the whole family with
   * `store.revokeGrant`, and is reported to {@link ProviderOptions.onDiagnostic} as `refresh_refused`. Anything else
   * than a boolean makes `handle` reject with `TypeError`, and, as with the store and the `claims` callback, an
   * exception it throws or a promise it rejects makes `handle` reject with that error and revokes nothing. The
   * refresh token is spent by then, so the client's retry with it is a reuse and revokes the family: an app whose
   * check fails on a transient outage signs its users out, so keep the check from throwing, or answer `false`.
   *
   * It is not called for a code exchange, which is the sign-in itself.
   */
  readonly onRefresh?: (request: RefreshCheck) => boolean | Promise<boolean>;
  /**
   * Returns claims the app adds to each JWT access token, such as the user's roles for a resource server. Called
   * for every JWT access token the provider issues: at the code exchange, at each refresh, and for
   * `client_credentials`, whose `subject` is the client identifier.
   *
   * The provider's own claims always win: a returned `iss`, `exp`, `aud`, `sub`, `client_id`, `iat`, `jti`,
   * `scope`, `auth_time`, `acr`, `amr`, `nbf`, `cnf` or `azp` is dropped, as is any other claim the token sets, even
   * one this token happens not to carry. Only own enumerable data properties are read, so a getter never runs, and
   * a property whose value is `undefined` is left out. Keep the claims small and free of anything the client must
   * not read: a JWT access token is readable by whoever holds it.
   *
   * A result that is not a plain object, such as an array, `null`, a `Date`, a `Map` or a class instance, makes `handle` reject with `TypeError`, and,
   * as with the `claims` callback, a throw or a rejected promise makes `handle` reject with that error. At a
   * refresh it runs before the next refresh token is saved, so a failure leaves no token the client never
   * receives; the spent refresh token makes the client's retry a reuse, which revokes the family.
   *
   * Requires `accessToken: { format: "jwt" }`; given with opaque access tokens, `createProvider` throws
   * `TypeError`, since an opaque token carries no claims.
   */
  readonly accessTokenClaims?: (
    request: AccessTokenClaimsRequest,
  ) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;
  /**
   * The subject identifier types the provider offers (OpenID Connect Core §8), published as discovery's
   * `subject_types_supported`. A non-empty list of `public` and `pairwise`, without repeats.
   *
   * The provider never derives a subject: the app passes each sign-in's `subject` to `completeAuthorization`, so
   * listing `pairwise` states that the app gives the clients it chose a subject of their own, derived as OpenID
   * Connect Core §8.1 describes. The provider does not check that it does.
   *
   * @defaultValue `["public"]`
   */
  readonly subjectTypes?: readonly ("public" | "pairwise")[];
}

/** What {@link ProviderOptions.accessTokenClaims} is asked about: the JWT access token about to be signed. Frozen. */
export interface AccessTokenClaimsRequest {
  /** The user the token is for, or the client identifier for `client_credentials`. */
  readonly subject: string;
  readonly clientId: string;
  /** The scopes the token carries. */
  readonly scopes: readonly string[];
  /** The token's audience, as its `aud` claim and {@link AccessTokenRecord.audience} hold it. */
  readonly audience: readonly string[];
  /** The grant the token belongs to; for `client_credentials`, a new one per token. */
  readonly grantId: string;
}

/** What {@link ProviderOptions.onRefresh} is asked about: the refresh that is about to issue tokens. */
export interface RefreshCheck {
  /** The user the family was issued to. */
  readonly subject: string;
  readonly clientId: string;
  /**
   * The scopes this refresh will issue: the request's `scope`, or, when it sent none, the family's scopes that the
   * client's record still lists.
   */
  readonly scopes: readonly string[];
  /** The grant the family belongs to; the provider revokes it when the answer is `false`. */
  readonly grantId: string;
  /** The app's session the grant was issued during, when `completeAuthorization` was given one. */
  readonly sessionId?: string;
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
  /**
   * The `acr_values` the client asked for, as authentication context class references in its order of preference,
   * with empty entries dropped. A voluntary request (OpenID Connect Core §3.1.2.1): the provider does not check the
   * login against it. The app chooses whether to satisfy one of them, and reports the class it actually used as
   * the `acr` of its {@link AuthorizationGrant}, which may be none of these.
   */
  readonly acrValues?: readonly string[];
  /**
   * The `claims_locales` the client asked for: BCP 47 tags in order of preference, with empty entries dropped, for
   * the language of the claims the app returns from the `claims` callback. The provider does not use it itself. The
   * `claims` request parameter is still not supported, and is ignored.
   */
  readonly claimsLocales?: readonly string[];
  /**
   * How the client asks the app to show its pages. A hint: a `display` other than `page`, `popup`, `touch` or `wap`
   * is ignored, so it is absent here, and the app may ignore this one as well.
   */
  readonly display?: Display;
  /**
   * The resource servers the client asked for tokens to (RFC 8707 `resource`), each one of the client's
   * `resources`. Show them on the consent page: the grant covers every one, and the app cannot narrow it.
   */
  readonly resources?: readonly string[];
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
  /**
   * The app's identifier for the session this sign-in belongs to: a non-empty string of visible ASCII (no space,
   * control character or non-ASCII character), opaque to the provider, which never interprets it. It is saved with
   * the code and every access and refresh token of the grant, and each ID token of the grant carries it as the
   * `sid` claim (OpenID Connect Front-Channel Logout 1.0 §3). The app can then tell which of its sessions a
   * grant belongs to, such as to revoke the grants of one session, and back-channel logout can name the session.
   * Use a value that is stable for the session and not guessable from outside, such as a random identifier, and not
   * the session cookie itself, since an ID token is handed to the client. Absent, the grant has no `sid`.
   */
  readonly sessionId?: string;
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

/** What {@link Provider.authenticate} requires of a token, beyond being a live access token. */
export interface AuthenticateOptions {
  /**
   * Scopes the token must carry, every one of them. A token missing one is refused with `insufficient_scope`, and
   * the challenge names these scopes. Each must be a scope token (RFC 6749 §3.3).
   */
  readonly scopes?: readonly string[];
  /**
   * The resource server the token must be for: one of the {@link AccessTokenRecord.audience} values, compared byte
   * for byte. A token issued for another resource, or for none, is refused with `invalid_token`. Absent, the
   * audience is not checked, which suits only an API that every token of the provider may call.
   */
  readonly audience?: string;
}

/** Why {@link Provider.authenticate} refused a request, for the app's logs. */
export type AuthenticationFailureReason =
  | "access_token_missing"
  | "access_token_malformed"
  | "access_token_unknown"
  | "access_token_expired"
  | "access_token_audience_mismatch"
  | "access_token_scope_insufficient";

/**
 * Why a request to the app's API did not authenticate, and how to answer it. The issue's code is the RFC 6750 error:
 * `invalid_request` for a malformed `Authorization` header, `insufficient_scope` for a token without a required
 * scope, and `invalid_token` for everything else, including a request with no token, whose challenge has no error.
 */
export interface AuthenticationFailure extends OidcFailure {
  /**
   * The response to return as is: `401` with `WWW-Authenticate: Bearer` when no token was sent, `400` with
   * `error="invalid_request"` for a malformed header, `403` with `error="insufficient_scope"` and the required
   * scopes in `scope`, or `401` with `error="invalid_token"`. It is `no-store` and carries no CORS headers.
   */
  readonly response: Response;
  /** Which check failed. Never sent to the client. */
  readonly reason: AuthenticationFailureReason;
  /** The client the token was issued to, when the store found the token. */
  readonly clientId?: string;
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
   * that parsed it. A signing key from another `@codenhub/jwt` copy also makes the JWKS endpoint reject, and
   * any token response that signs an ID token or a JWT access token; see {@link ProviderOptions.signingKeys}.
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
   * completed, or expired, or, for a grant, when its client is no longer in the store: the code's lifetime can be
   * the client's own ({@link ClientRecord.ttl}), so a grant reads the client's record. Rejects when the store does,
   * or with a `TypeError` when it returns a malformed client record.
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
  /**
   * Builds the back-channel logout request (OpenID Connect Back-Channel Logout 1.0) that tells one client its user
   * signed out, for the app to send with `fetch`. The provider keeps no sessions and makes no outbound request: the
   * app ends its own session, knows which clients it signed the user into during it (the `sessionId` it gave
   * {@link Provider.completeAuthorization}, which became `sid`), and calls this for each of them.
   *
   * @remarks
   * The request is a `POST` to the client's {@link ClientRecord.backchannelLogout} `uri`, with the form body
   * `logout_token=<token>`. The token is a JWT signed like the client's ID tokens, with `typ: "logout+jwt"`, the
   * claims `iss`, `aud` (the client), `iat`, `exp` (120 seconds after `iat`), a random `jti`, `events`, and the
   * `sub` and `sid` given here, and never a `nonce`.
   *
   * The app owns the delivery. The client answers `200` on success, or `400` with an error (§2.8), so treat any
   * `2xx` as success and anything else as a failure. Use a short timeout, since a slow client must not hold the
   * user's sign-out, and decide whether to retry. The request has `redirect: "manual"`, so `fetch` never forwards
   * the token to a redirect's target: Node.js and workerd return the `3xx` response itself, and a browser's `fetch`
   * an opaque-redirect response with status `0`. Either way `response.ok` is `false`; treat it as a failure.
   *
   * @param request - The client, and who or what ended. At least one of `subject` and `sessionId` is required.
   * @returns The request to send, or `null` when the client is unknown or has no `backchannelLogout`, so there
   * is nothing to send. Rejects when the store does, or with a `TypeError` when it returns a malformed client record.
   * @throws {TypeError} When `clientId` is not a non-empty string, when neither `subject` nor `sessionId` is given,
   * when either is given and is not a non-empty string, or when the client's `sessionRequired` is `true` and
   * `sessionId` is absent. The check of the arguments comes before the store is read.
   */
  backchannelLogout(request: {
    readonly clientId: string;
    readonly subject?: string;
    readonly sessionId?: string;
  }): Promise<Request | null>;
  /**
   * Checks the bearer token of a request to the app's own API, served beside the provider over the same store: the
   * access token in the `Authorization` header, its expiry, then the `audience` and `scopes` the API requires.
   *
   * @remarks
   * The token is read from the `Authorization: Bearer` header only, as userinfo reads it, and is looked up by its
   * digest among access tokens, so an ID token, a refresh token or a code never authenticates. It works for opaque
   * and JWT access tokens alike, and sees a revocation at once. The audience is checked before the scopes. Nothing
   * is reported to {@link ProviderOptions.onDiagnostic}; the failure's `reason` is for the app's logs.
   *
   * @param request - The request to the API. Only its headers are read.
   * @param options - What the token must carry.
   * @returns The token's record, a frozen copy, or a failure with the response to send. Never throws for any
   * request; rejects only when the store does, or with a `TypeError` when `options` is malformed: not an object,
   * `scopes` that is not an array of scope tokens, or an `audience` that is not a non-empty string. Options are
   * checked before the store is read.
   */
  authenticate(
    request: Request,
    options?: AuthenticateOptions,
  ): Promise<OidcResult<AccessTokenRecord, AuthenticationFailure>>;
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
   * The user a verified `id_token_hint` names. The hint may have expired, so compare it with the user of the
   * app's own session, and ask the user to confirm when they differ or there is no session. Absent without a
   * verified hint: then nothing ties the request to a user, and the app should ask the user to confirm before it
   * signs them out.
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
