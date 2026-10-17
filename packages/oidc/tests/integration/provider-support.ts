import { createHash } from "node:crypto";

import { generateKeyPair, type KeyPair } from "@codenhub/jwt";

import {
  type AuthorizationFailure,
  type AuthorizationGrant,
  createProvider,
  generateClientSecret,
  hashClientSecret,
  type OidcStore,
  type Provider,
  type ProviderOptions,
} from "../../src/provider";
import { createMemoryStore, type MemoryStore } from "../../src/testing";

export const ISSUER = "https://op.example";
export const REDIRECT_URI = "https://app.example/cb";
export const PUBLIC_CLIENT = "spa";
export const CONFIDENTIAL_CLIENT = "app";
export const SUBJECT = "user-1";
export const VERIFIER = "v".repeat(43);
export const STATE = "state-0123456789abcdef";
export const NONCE = "nonce-0123456789abcdef";

export const AUTHORIZE_URL = `${ISSUER}/authorize`;
export const TOKEN_URL = `${ISSUER}/token`;
export const USERINFO_URL = `${ISSUER}/userinfo`;
export const JWKS_URL = `${ISSUER}/jwks`;
export const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;

const FORM_MEDIA_TYPE = "application/x-www-form-urlencoded";
const CLIENT_SCOPES = ["openid", "profile", "email", "offline_access"];
const START_MS = 1_800_000_000_000;

/** The S256 challenge of {@link VERIFIER}, computed the way RFC 7636 §4.2 defines it. */
export const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

/** A mutable clock, in milliseconds since the Unix epoch. The provider and its store both read it. */
export interface Clock {
  ms: number;
}

/** Credentials for HTTP Basic client authentication (RFC 6749 §2.3.1). */
export interface Basic {
  readonly clientId: string;
  readonly secret: string;
}

/** What {@link issueCode} returns: the code from the success redirect, and what redeems it. */
export interface IssuedCode {
  readonly code: string;
  readonly verifier: string;
  readonly interactionId: string;
  readonly location: string;
}

/** The token endpoint's success body (RFC 6749 §5.1), with the ID token of OpenID Connect Core §3.1.3.3. */
export interface TokenBody {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly id_token: string;
  readonly refresh_token?: string;
  readonly scope: string;
}

/** The result of a full code exchange: the code, the raw response, and its parsed tokens on success. */
export interface Issued {
  readonly code: IssuedCode;
  readonly response: Response;
  readonly tokens: TokenBody;
}

/** Overrides {@link setUpProvider} accepts. */
export interface SetUpOverrides {
  readonly claims?: ProviderOptions["claims"];
  readonly scopes?: ProviderOptions["scopes"];
  readonly ttl?: ProviderOptions["ttl"];
  /** Wraps the memory store before the provider receives it, for example to record its calls. */
  readonly wrapStore?: (store: MemoryStore) => OidcStore;
}

/** A provider with two registered clients, and everything a test needs to drive it. */
export interface ProviderSetup {
  readonly provider: Provider;
  readonly store: OidcStore;
  readonly signingKey: KeyPair;
  readonly now: Clock;
  readonly publicClient: typeof PUBLIC_CLIENT;
  readonly confidentialClient: typeof CONFIDENTIAL_CLIENT;
  /** The plaintext secret of the confidential client. Only its digest is registered. */
  readonly secret: string;
}

const defaultClaims = (): Record<string, unknown> => ({ name: "Ada Lovelace", email: "ada@example.com" });

/**
 * Creates a provider over the in-memory store, with a public client `spa` (no authentication) and a
 * confidential client `app` (`client_secret_basic`). Both redirect to {@link REDIRECT_URI}.
 */
export async function setUpProvider(overrides: SetUpOverrides = {}): Promise<ProviderSetup> {
  const now: Clock = { ms: START_MS };
  const signingKey = await generateKeyPair({ alg: "ES256", kid: "op-1" });
  const secret = generateClientSecret();
  const memory = createMemoryStore({
    clients: [
      {
        clientId: PUBLIC_CLIENT,
        redirectUris: [REDIRECT_URI],
        scopes: CLIENT_SCOPES,
        auth: { method: "none" },
      },
      {
        clientId: CONFIDENTIAL_CLIENT,
        redirectUris: [REDIRECT_URI],
        scopes: CLIENT_SCOPES,
        auth: { method: "client_secret_basic", secretHash: await hashClientSecret(secret) },
      },
    ],
  });
  const store = overrides.wrapStore === undefined ? memory : overrides.wrapStore(memory);
  const provider = createProvider({
    issuer: ISSUER,
    signingKeys: [signingKey],
    store,
    claims: overrides.claims ?? defaultClaims,
    scopes: overrides.scopes,
    ttl: overrides.ttl,
    now: () => now.ms,
  });
  return {
    provider,
    store,
    signingKey,
    now,
    publicClient: PUBLIC_CLIENT,
    confidentialClient: CONFIDENTIAL_CLIENT,
    secret,
  };
}

/**
 * Builds a GET authorization request URL for `https://op.example/authorize`. The defaults are a valid
 * request from the public client; a `null` value removes that parameter, and any other value replaces it.
 */
export function authorizationUrl(params: Readonly<Record<string, string | null>> = {}): string {
  const url = new URL(AUTHORIZE_URL);
  const defaults: Readonly<Record<string, string | null>> = {
    response_type: "code",
    client_id: PUBLIC_CLIENT,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile",
    state: STATE,
    nonce: NONCE,
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
  };
  for (const [name, value] of Object.entries({ ...defaults, ...params })) {
    if (value !== null) {
      url.searchParams.set(name, value);
    }
  }
  return url.href;
}

/** Runs `beginAuthorization` on a URL and returns its failure, failing the test when it succeeds. */
export async function beginFailure(provider: Provider, url: string): Promise<AuthorizationFailure> {
  const result = await provider.beginAuthorization(new Request(url));
  if (result.ok) {
    throw new Error(`beginAuthorization accepted ${url}`);
  }
  return result.error;
}

/**
 * Describes a redirect for exact comparison: its status, the URL it goes to without its query, and the
 * query parameters it carries. `null` when there is no redirect.
 */
export function summarizeRedirect(response: Response | null): {
  readonly status: number;
  readonly target: string;
  readonly params: Readonly<Record<string, string>>;
} | null {
  if (response === null) {
    return null;
  }
  const destination = new URL(response.headers.get("location") ?? "");
  const params = Object.fromEntries(destination.searchParams);
  destination.search = "";
  return { status: response.status, target: destination.href, params };
}

/** Answers a request with the provider, failing the test when no endpoint of the provider answers it. */
export async function answer(provider: Provider, request: Request): Promise<Response> {
  const response = await provider.handle(request);
  if (response === null) {
    throw new Error(`no endpoint answers ${request.method} ${request.url}`);
  }
  return response;
}

/** The HTTP Basic `authorization` header for the given client credentials. */
export function basicHeader({ clientId, secret }: Basic): string {
  // RFC 6749 §2.3.1: id and secret are form-encoded before base64. URLSearchParams does exactly that, and
  // encodes characters such as `!`, `'`, `(` and `)` that a bare encodeURIComponent would leave alone.
  const formEncode = (value: string): string => new URLSearchParams({ value }).toString().slice("value=".length);
  return `Basic ${Buffer.from(`${formEncode(clientId)}:${formEncode(secret)}`).toString("base64")}`;
}

/**
 * Builds a POST to the token endpoint. A string body is sent as it is; an object is form-encoded. The
 * content type defaults to `application/x-www-form-urlencoded`.
 */
export function tokenRequest(
  body: Readonly<Record<string, string>> | string,
  options: { readonly basic?: Basic; readonly contentType?: string } = {},
): Request {
  const headers = new Headers({ "content-type": options.contentType ?? FORM_MEDIA_TYPE });
  if (options.basic !== undefined) {
    headers.set("authorization", basicHeader(options.basic));
  }
  const text = typeof body === "string" ? body : new URLSearchParams(body).toString();
  return new Request(TOKEN_URL, { method: "POST", headers, body: text });
}

/** Posts a form to the token endpoint of the setup's provider. */
export async function redeem(
  setup: ProviderSetup,
  body: Readonly<Record<string, string>> | string,
  basic?: Basic,
): Promise<Response> {
  return answer(setup.provider, tokenRequest(body, basic === undefined ? {} : { basic }));
}

/** The authorization code grant form for an issued code, from the given client. */
export function codeForm(
  issued: IssuedCode,
  clientId: string,
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return {
    grant_type: "authorization_code",
    code: issued.code,
    redirect_uri: REDIRECT_URI,
    code_verifier: issued.verifier,
    client_id: clientId,
    ...overrides,
  };
}

/** The refresh token grant form. */
export function refreshForm(refreshToken: string, clientId: string): Record<string, string> {
  return { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId };
}

/** Copies a form without one of its parameters. */
export function without(form: Readonly<Record<string, string>>, name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(form).filter(([key]) => key !== name));
}

/** A GET request to the userinfo endpoint with the access token in the `Authorization` header. */
export function userinfoRequest(accessToken: string): Request {
  return new Request(USERINFO_URL, { method: "GET", headers: { authorization: `Bearer ${accessToken}` } });
}

/** Options for {@link issueCode}. */
export interface IssueOptions {
  /** Authorization request parameters, applied over the defaults of {@link authorizationUrl}. */
  readonly params?: Readonly<Record<string, string | null>>;
  /** Grant fields, applied over a grant of the requested scopes, authenticated now. */
  readonly grant?: Partial<AuthorizationGrant>;
}

/** Runs `beginAuthorization` and `completeAuthorization` for a valid grant, and returns the code. */
export async function issueCode(setup: ProviderSetup, options: IssueOptions = {}): Promise<IssuedCode> {
  const begun = await setup.provider.beginAuthorization(new Request(authorizationUrl(options.params)));
  if (!begun.ok) {
    throw new Error(`beginAuthorization failed: ${JSON.stringify(begun.error.issues)}`);
  }
  const completed = await setup.provider.completeAuthorization(begun.value.id, {
    subject: SUBJECT,
    authTime: Math.floor(setup.now.ms / 1000),
    scopes: begun.value.scopes,
    amr: ["pwd"],
    ...options.grant,
  });
  if (!completed.ok) {
    throw new Error(`completeAuthorization failed: ${JSON.stringify(completed.error.issues)}`);
  }
  const location = completed.value.headers.get("location") ?? "";
  const code = new URL(location).searchParams.get("code") ?? "";
  return { code, verifier: VERIFIER, interactionId: begun.value.id, location };
}

/**
 * Runs a full code exchange: a sign-in for the default scopes, then redemption of the code, as the public
 * client or as the confidential client with its secret.
 *
 * @throws when the exchange does not answer `200`, so a test never works from a missing token.
 */
export async function issueTokens(
  setup: ProviderSetup,
  options: { readonly confidential?: boolean; readonly scope?: string } = {},
): Promise<Issued> {
  const clientId = options.confidential === true ? CONFIDENTIAL_CLIENT : PUBLIC_CLIENT;
  const code = await issueCode(setup, {
    params: { client_id: clientId, scope: options.scope ?? "openid profile offline_access" },
  });
  const response = await redeem(
    setup,
    codeForm(code, clientId),
    options.confidential === true ? { clientId, secret: setup.secret } : undefined,
  );
  if (response.status !== 200) {
    throw new Error(`token exchange answered ${response.status}`);
  }
  return { code, response, tokens: (await response.json()) as TokenBody };
}
