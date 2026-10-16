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
  | { readonly method: "client_secret_jwt"; readonly key: SecretKey }
  /** A private key whose public half the provider has registered for this client. */
  | { readonly method: "private_key_jwt"; readonly key: PrivateKey };

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
}

/** How {@link createClient} talks to one provider. Invalid options throw `TypeError` at creation. */
export interface ClientOptions {
  /**
   * The provider's metadata: what {@link discover} returned, or a document written by hand for a
   * provider without discovery. It is checked as strictly as a fetched one.
   */
  readonly metadata: ProviderMetadata;
  /** The client identifier the provider registered. */
  readonly clientId: string;
  /** The redirect URI registered for this client, sent with every authorization request. */
  readonly redirectUri: string;
  /** How the client authenticates to the token endpoint. */
  readonly auth: ClientAuth;
  /**
   * The `fetch` to call for the token, userinfo, and JWKS endpoints.
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
   * through 300.
   *
   * @defaultValue 0
   */
  readonly clockTolerance?: number;
  /**
   * Current time in milliseconds since the Unix epoch, for tests.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
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
  /** Maximum seconds since the user last authenticated. When set, the ID token must carry `auth_time`. */
  readonly maxAge?: number;
  /** A hint about the account to sign in with, such as an email address. */
  readonly loginHint?: string;
  /** Preferred languages for the provider's pages, as BCP 47 tags. */
  readonly uiLocales?: readonly string[];
}

/**
 * What the app keeps between the authorization request and its callback, typically in a server-side
 * session or an encrypted, `HttpOnly` cookie. Plain JSON: it survives `JSON.stringify` and
 * `structuredClone` unchanged. It holds the PKCE verifier, so treat it as a secret.
 */
export interface PendingAuthorization {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  /** The `max_age` that was requested, in seconds, when one was. */
  readonly maxAge?: number;
}

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
}

/** A completed refresh. Frozen. */
export interface Refreshed {
  readonly tokens: TokenSet;
  /** The new ID token's claims, when the provider sent one. */
  readonly claims?: IdTokenClaims;
}

/** What to refresh. */
export interface RefreshOptions {
  readonly refreshToken: string;
  /** The `sub` of the original ID token. When the provider sends a new ID token, its `sub` must equal it. */
  readonly subject: string;
  /** A narrower set of scopes to request. Must be within the original grant. */
  readonly scope?: readonly string[];
}

/** What to ask the userinfo endpoint. */
export interface UserinfoOptions {
  readonly accessToken: string;
  /** The `sub` of the ID token. The response's `sub` must equal it (OpenID Connect Core §5.3.2). */
  readonly subject: string;
}

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
   * Finishes a sign-in from the URL the provider redirected the browser to: checks `state` and `iss`,
   * exchanges the code, and validates the ID token.
   *
   * @returns The validated claims and tokens, or every issue found. Never throws for any URL or response.
   */
  callback(url: string | URL, pending: PendingAuthorization): Promise<OidcResult<SignIn>>;
  /**
   * Exchanges a refresh token for new tokens. The provider rotates refresh tokens, so store the new one.
   *
   * @returns The new tokens, or every issue found. Never throws for any response.
   */
  refresh(options: RefreshOptions): Promise<OidcResult<Refreshed>>;
  /**
   * Fetches the user's claims from the userinfo endpoint.
   *
   * @returns The claims, or every issue found. Never throws for any response.
   */
  userinfo(options: UserinfoOptions): Promise<OidcResult<UserinfoClaims>>;
}
