import * as jwt from "@codenhub/jwt";
import type { JwtPayload, KeyPair, SignHeader } from "@codenhub/jwt";

import {
  type AuthorizeOptions,
  type Client,
  type ClientAuth,
  type ClientOptions,
  createClient,
  discover,
  type PendingAuthorization,
  type ProviderMetadata,
  type SignIn,
} from "../../src/client";
import { createProvider, generateClientSecret, hashClientSecret, type Provider } from "../../src/provider";
import { createMemoryStore } from "../../src/testing";

/*
 * A real provider and a client wired to it through a fake `fetch`, so the client's requests reach the
 * provider's `handle` with no network. A test can rewrite any provider response on the way back, which is
 * how the hostile cases are made: a forged ID token, a huge or slow token response, a wrong subject.
 */

export const ISSUER = "https://op.example";
export const CLIENT_ID = "app";
export const REDIRECT_URI = "https://app.example/cb";
export const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
export const TOKEN_URL = `${ISSUER}/token`;
export const USERINFO_URL = `${ISSUER}/userinfo`;
export const JWKS_URL = `${ISSUER}/jwks`;

/** Rewrites one provider response. The URL is the request's, so a tamper can act on one endpoint only. */
export type Tamper = (url: string, response: Response) => Response | Promise<Response>;

export interface SetUpOptions {
  /** Applied to every provider response, discovery included. */
  readonly tamper?: Tamper;
  /** Registers the client with `client_secret_basic` instead of as a public client. */
  readonly confidential?: boolean;
}

/** A provider, a client for it, and the means to change what the provider answers. */
export interface Harness {
  readonly provider: Provider;
  readonly metadata: ProviderMetadata;
  readonly client: Client;
  /** The provider's ES256 signing key, kid `op-1`. */
  readonly signingKey: KeyPair;
  /** The fake `fetch` the client uses, for building a second client over the same provider. */
  readonly fetch: typeof fetch;
  readonly clientAuth: ClientAuth;
  /** The client secret, for a confidential setup. Empty for a public one. */
  readonly clientSecret: string;
  /** Replaces the tamper for every later response. `undefined` removes it. */
  readonly setTamper: (tamper: Tamper | undefined) => void;
}

/** What a started sign-in hands the test: the client, what the app keeps, and the callback URL. */
export interface SignInStart {
  readonly client: Client;
  readonly pending: PendingAuthorization;
  readonly location: string;
}

let active: Harness | undefined;

function requireActive(): Harness {
  if (active === undefined) {
    throw new Error("setUp() must run before the helpers that use the provider");
  }
  return active;
}

/** Builds a provider, a client, and the fake fetch, after discovering the provider through that fetch. */
export async function setUp(options: SetUpOptions = {}): Promise<Harness> {
  const confidential = options.confidential === true;
  const signingKey = await jwt.generateKeyPair({ alg: "ES256", kid: "op-1" });
  const clientSecret = confidential ? generateClientSecret() : "";
  const store = createMemoryStore({
    clients: [
      {
        clientId: CLIENT_ID,
        redirectUris: [REDIRECT_URI],
        scopes: ["openid", "profile", "offline_access"],
        auth: confidential
          ? { method: "client_secret_basic", secretHash: await hashClientSecret(clientSecret) }
          : { method: "none" },
      },
    ],
  });
  const provider = createProvider({
    issuer: ISSUER,
    signingKeys: [signingKey],
    store,
    claims: ({ subject }) => ({ name: `User ${subject}`, email: "never-released@example.com" }),
  });

  const slot: { tamper: Tamper | undefined } = { tamper: options.tamper };
  const fakeFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const response = (await provider.handle(request)) ?? new Response(null, { status: 404 });
    return slot.tamper === undefined ? response : slot.tamper(request.url, response);
  };

  const discovered = await discover(ISSUER, { fetch: fakeFetch });
  if (!discovered.ok) {
    throw new Error(`discovery failed: ${JSON.stringify(discovered.error.issues)}`);
  }
  const clientAuth: ClientAuth = confidential
    ? { method: "client_secret_basic", secret: clientSecret }
    : { method: "none" };
  const client = createClient({
    metadata: discovered.value,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    auth: clientAuth,
    fetch: fakeFetch,
  });

  const harness: Harness = {
    provider,
    metadata: discovered.value,
    client,
    signingKey,
    fetch: fakeFetch,
    clientAuth,
    clientSecret,
    setTamper: (tamper) => {
      slot.tamper = tamper;
    },
  };
  active = harness;
  return harness;
}

/** A second client over the same provider, for options the shared one does not set, such as `timeout`. */
export function clientWith(harness: Harness, overrides: Partial<ClientOptions>): Client {
  return createClient({
    metadata: harness.metadata,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    auth: harness.clientAuth,
    fetch: harness.fetch,
    ...overrides,
  });
}

/**
 * Runs authorize, then the provider's authorization step, as the app's login page would, and returns the
 * callback URL the provider redirected to. The callback itself is left to the test.
 */
export async function startSignIn(options: AuthorizeOptions = {}): Promise<SignInStart> {
  const harness = requireActive();
  const started = await harness.client.authorize({ scope: ["openid", "profile", "offline_access"], ...options });
  // The app keeps the pending state in its session, which is plain JSON, so the test sees the same copy.
  const pending = JSON.parse(JSON.stringify(started.pending)) as PendingAuthorization;
  const begun = await harness.provider.beginAuthorization(new Request(started.url));
  if (!begun.ok) {
    throw new Error(`beginAuthorization failed: ${JSON.stringify(begun.error.issues)}`);
  }
  const completed = await harness.provider.completeAuthorization(begun.value.id, {
    subject: "user-1",
    authTime: Math.floor(Date.now() / 1000),
    scopes: begun.value.scopes,
    amr: ["pwd"],
  });
  if (!completed.ok || completed.value.status !== 302) {
    throw new Error("completeAuthorization did not redirect");
  }
  return {
    client: harness.client,
    pending,
    location: completed.value.headers.get("location") ?? "",
  };
}

/** Completes a sign-in with the provider's own tokens, and returns the validated sign-in. Throws when it fails. */
export async function signedIn(options: AuthorizeOptions = {}): Promise<SignIn> {
  const started = await startSignIn(options);
  const result = await started.client.callback(started.location, started.pending);
  if (!result.ok) {
    throw new Error(`callback failed: ${JSON.stringify(result.error.issues)}`);
  }
  return result.value;
}

/** Claims of an ID token the provider would issue for `pending`, with `overrides` applied. `undefined` removes a claim. */
export function claimsFor(
  pending: PendingAuthorization,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: ISSUER,
    sub: "user-1",
    aud: CLIENT_ID,
    iat: now,
    exp: now + 300,
    auth_time: now,
    nonce: pending.nonce,
    ...overrides,
  };
  for (const name of Object.keys(claims)) {
    if (claims[name] === undefined) {
      delete claims[name];
    }
  }
  return claims;
}

/** Signs `claims` with the provider's own signing key, as a token the provider could have issued. */
export function forgeIdToken(claims: Readonly<Record<string, unknown>>, header?: SignHeader): Promise<string> {
  const { signingKey } = requireActive();
  return jwt.sign({
    payload: claims as JwtPayload,
    key: signingKey.privateKey,
    ...(header === undefined ? {} : { header }),
  });
}

/** Signs `claims` with a different key that carries the provider's `kid`, so only the signature is wrong. */
export async function foreignIdToken(claims: Readonly<Record<string, unknown>>, header?: SignHeader): Promise<string> {
  const foreign = await jwt.generateKeyPair({ alg: "ES256", kid: "op-1" });
  return jwt.sign({
    payload: claims as JwtPayload,
    key: foreign.privateKey,
    ...(header === undefined ? {} : { header }),
  });
}

/** An unsigned token: a header, a payload, and an empty signature. */
export function unsignedToken(
  payload: Readonly<Record<string, unknown>>,
  header: Readonly<Record<string, unknown>>,
): string {
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode(header)}.${encode(payload)}.`;
}

/** Applies `change` to the response only when the request went to `endpoint`. */
export function onlyAt(endpoint: string, change: (response: Response) => Response | Promise<Response>): Tamper {
  return (url, response) => (url === endpoint ? change(response) : response);
}

/** A JSON response with the given status, as the provider sends them. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** The JSON object a response carries, read once. */
export async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** Changes a JSON response's object with `edit`, keeping its status. */
export function editJson(
  edit: (body: Record<string, unknown>) => Record<string, unknown>,
): (response: Response) => Promise<Response> {
  return async (response) => jsonResponse(edit(await readJsonObject(response)), response.status);
}

/** Replaces the `id_token` of a token response with one `build` makes, keeping the real `access_token`. */
export function swapIdToken(build: (accessToken: string) => Promise<string>): Tamper {
  return onlyAt(TOKEN_URL, async (response) => {
    const body = await readJsonObject(response);
    const idToken = await build(String(body.access_token));
    return jsonResponse({ ...body, id_token: idToken }, response.status);
  });
}

/** A copy of an URL with its query parameters changed. An `undefined` value removes the parameter. */
export function withParams(url: string, changes: Readonly<Record<string, string | undefined>>): string {
  const result = new URL(url);
  for (const [name, value] of Object.entries(changes)) {
    if (value === undefined) {
      result.searchParams.delete(name);
    } else {
      result.searchParams.set(name, value);
    }
  }
  return result.href;
}

/** A copy of a URL with one more query parameter, so a parameter can appear twice. */
export function appendParam(url: string, name: string, value: string): string {
  const result = new URL(url);
  result.searchParams.append(name, value);
  return result.href;
}

/** The authorization code the provider put in a callback URL. */
export function codeOf(location: string): string {
  const code = new URL(location).searchParams.get("code");
  if (code === null) {
    throw new Error("the callback URL carries no code");
  }
  return code;
}
