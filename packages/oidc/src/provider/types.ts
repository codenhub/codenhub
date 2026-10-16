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

/** A registered client, as the store returns it. A malformed record throws `TypeError` when used. */
export interface ClientRecord {
  readonly clientId: string;
  /** Redirect URIs, each compared to the requested one byte for byte. Each must be an absolute URL without a fragment. */
  readonly redirectUris: readonly string[];
  /** Scopes this client may request. Must include `openid`. */
  readonly scopes: readonly string[];
  /** How this client authenticates to the token endpoint. */
  readonly auth: ClientAuthentication;
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
 * an in-memory reference.
 *
 * Every key the provider passes for a code, token, or interaction is a SHA-256 digest of the value, never
 * the value itself, so a leaked store holds nothing usable. Interaction, code and token records are plain
 * JSON; a client record may hold `@codenhub/jwt` keys, which the app rebuilds from what it persists. Methods may throw or
 * reject on infrastructure failure; the provider lets that propagate rather than answering as if the
 * value were invalid.
 *
 * The `consume*` methods must be atomic: two concurrent calls for one key must never both get
 * `consumed`. A store without a compare-and-set or transaction, such as plain Cloudflare KV, cannot
 * implement them; use D1, a Durable Object, or a SQL transaction.
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

/** Endpoint URLs, each an absolute `https` URL on any origin. */
export interface ProviderEndpoints {
  /** @defaultValue `${issuer}/authorize` */
  readonly authorization?: string;
  /** @defaultValue `${issuer}/token` */
  readonly token?: string;
  /** @defaultValue `${issuer}/userinfo` */
  readonly userinfo?: string;
  /** @defaultValue `${issuer}/jwks` */
  readonly jwks?: string;
}

/** How {@link createProvider} runs. Invalid options throw `TypeError` at creation. */
export interface ProviderOptions {
  /** The issuer identifier: an `https` URL without query or fragment, used byte for byte everywhere. */
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
  /** Endpoint URLs. */
  readonly endpoints?: ProviderEndpoints;
  /**
   * Current time in milliseconds since the Unix epoch, for tests.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
}

/** An authorization request the app now handles: who the client is, and what it asked for. Frozen. */
export interface AuthorizationInteraction {
  /** Pass this to {@link Provider.completeAuthorization}. Keep it where the user's browser cannot swap it for another user's, such as the app's session. */
  readonly id: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  /** `login` means authenticate again; `consent` means ask again; `none` means show nothing. */
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
   * Answers the discovery, JWKS, token, and userinfo endpoints.
   *
   * @returns The response, or `null` when the request is for none of those URLs. Never throws for any
   * request; rejects only when the store or the `claims` callback does, or with a `TypeError` when the
   * `claims` callback resolves to something that is not an object.
   */
  handle(request: Request): Promise<Response | null>;
  /**
   * Validates an authorization request and saves it as an interaction for the app's login and consent pages.
   *
   * @returns The interaction, or a failure whose `redirect` is the response to send, or `null` when the app
   * must render an error itself. Never throws for any request; rejects only when the store does.
   */
  beginAuthorization(request: Request): Promise<OidcResult<AuthorizationInteraction, AuthorizationFailure>>;
  /**
   * Finishes an interaction: issues a code, or sends the denial, as a `302` to the client's redirect URI.
   *
   * @returns The response, or `interaction_not_found` when the interaction does not exist, was already
   * completed, or expired.
   * @throws {TypeError} When `outcome` is invalid: scopes outside the request or without `openid`, an
   * `authTime` before the interaction under `prompt=login`, an `authTime` in the future, or older than the
   * requested `max_age`. The interaction is consumed before these checks, so after a `TypeError` a retry
   * gets `interaction_not_found` and the user must start over.
   */
  completeAuthorization(
    interactionId: string,
    outcome: AuthorizationGrant | AuthorizationDenial,
  ): Promise<OidcResult<Response>>;
}
