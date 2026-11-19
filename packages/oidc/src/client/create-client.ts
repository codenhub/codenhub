import { assertBodyUnread, readBody } from "../shared/body";
import { isFormContentType } from "../shared/content-type";
import { timingSafeEqual } from "../shared/encoding";
import { MAX_BODY_BYTES, MAX_PARAMETER_LENGTH, MAX_URL_LENGTH } from "../shared/limits";
import { parseParameters } from "../shared/parameters";
import { fail, ok } from "../shared/result";
import type { OidcIssue, OidcResult } from "../shared/types";
import { buildAuthorization, denseCopy, readResources, requireRedirectUri } from "./authorize";
import { buildEndSessionUrl } from "./end-session";
import { readErrorCode } from "./http";
import { createIdTokenValidator, createProviderKeySet, type IdTokenValidator } from "./id-token";
import { matchesTenantIssuer } from "./issuer";
import { createLogoutTokenValidator, readBackchannelLogout } from "./logout-token";
import { type ResolvedClientOptions, resolveClientOptions } from "./options";
import { requestRevocation, requestTokens } from "./tokens";
import type {
  AuthorizeOptions,
  CallbackInput,
  Client,
  ClientCredentialsOptions,
  EndSessionOptions,
  ClientOptions,
  OAuthClient,
  OAuthClientOptions,
  OAuthSignIn,
  PendingAuthorization,
  PreviousIdToken,
  Refreshed,
  RefreshOptions,
  SignIn,
  RevokeOptions,
  TokenSet,
} from "./types";
import { createUserinfoFetcher } from "./userinfo";

/** The callback parameters the client reads itself, which {@link SignIn.parameters} leaves out. */
const CONSUMED_PARAMETERS: ReadonlySet<string> = new Set(["state", "code", "iss"]);

/** RFC 6749 §3.3: printable ASCII except space, `"` and `\`. */
const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value !== "";

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isScopeToken = (value: unknown): boolean => typeof value === "string" && SCOPE_TOKEN.test(value);

/** Reads one required string option of `caller`, naming the option and never its value. */
function readRequiredString(record: Readonly<Record<string, unknown>>, name: string, caller: string): string {
  const value = record[name];
  if (!isNonEmptyString(value)) {
    throw new TypeError(`${caller}: ${name} must be a non-empty string`);
  }
  return value;
}

/**
 * Checks the pending state the app stored, which it passes back untouched. It is the caller's own data, so
 * a malformed value is a caller bug and throws; the names of the members are the only thing reported. A plain
 * OAuth 2.0 client's pending state has no nonce.
 */
function readPending(pending: unknown, openid: boolean): PendingAuthorization {
  if (!isObject(pending)) {
    throw new TypeError("callback: pending must be an object");
  }
  const state = readRequiredString(pending, "state", "callback: pending");
  const nonce = openid ? readRequiredString(pending, "nonce", "callback: pending") : undefined;
  const codeVerifier = readRequiredString(pending, "codeVerifier", "callback: pending");
  const { maxAge, requestedAt, responseMode } = pending;
  if (responseMode !== undefined && responseMode !== "form_post") {
    throw new TypeError('callback: pending.responseMode must be "form_post" when set');
  }
  const base = {
    state,
    ...(nonce === undefined ? {} : { nonce }),
    codeVerifier,
    ...(responseMode === undefined ? {} : { responseMode: "form_post" as const }),
  };
  if (maxAge === undefined) {
    return base;
  }
  if (!isNonNegativeInteger(maxAge)) {
    throw new TypeError("callback: pending.maxAge must be a non-negative integer");
  }
  if (!isNonNegativeInteger(requestedAt)) {
    throw new TypeError("callback: pending.requestedAt must be a non-negative integer when pending.maxAge is set");
  }
  return { ...base, maxAge, requestedAt };
}

/** An `invalid_callback` issue at the callback URL, with optional facts about why. */
const invalidCallback = (path: readonly string[], params?: Readonly<Record<string, string>>): OidcResult<never> =>
  fail(params === undefined ? { code: "invalid_callback", path } : { code: "invalid_callback", path, params });

/** Reads the parameters of a callback URL's query, where the `query` response mode puts them. */
function readUrlParameters(url: string | URL): OidcResult<ReadonlyMap<string, string>> {
  const text = url instanceof URL ? url.href : url;
  if (text.length > MAX_URL_LENGTH) {
    return invalidCallback(["callback"]);
  }
  // A browser cannot make the URL relative: only the calling code can, such as by passing Node.js's `req.url`, which
  // is a path. Answering it with an issue would make every sign-in fail and invite the app to start another.
  if (!URL.canParse(text)) {
    throw new TypeError("callback: url must be an absolute URL, such as request.url of a Fetch API request");
  }
  const parsed = parseParameters(new URL(text).search.slice(1));
  return parsed.ok ? ok(parsed.parameters) : invalidCallback(["callback"], { reason: parsed.reason });
}

/**
 * Reads the parameters of a `form_post` response (OAuth 2.0 Form Post Response Mode): a form body of at most
 * {@link MAX_BODY_BYTES} UTF-8 bytes, read with the rules a back-channel logout request is.
 */
async function readFormParameters(request: Request): Promise<OidcResult<ReadonlyMap<string, string>>> {
  if (!isFormContentType(request.headers.get("content-type"))) {
    return invalidCallback(["callback", "headers", "content-type"]);
  }
  const body = await readBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return invalidCallback(["callback", "body"], { reason: body.reason });
  }
  const parsed = parseParameters(body.text);
  return parsed.ok ? ok(parsed.parameters) : invalidCallback(["callback", "body"], { reason: parsed.reason });
}

/**
 * Reads the parameters of the authorization response, from where the pending request's response mode puts them: the
 * URL's query for `query`, and a POST body for `form_post`. A response that arrived another way is refused, since a
 * provider never sends it so.
 */
async function readCallbackParameters(
  input: CallbackInput,
  pending: PendingAuthorization,
): Promise<OidcResult<ReadonlyMap<string, string>>> {
  const formPost = pending.responseMode === "form_post";
  if (typeof input === "string" || input instanceof URL) {
    return formPost ? invalidCallback(["callback", "method"]) : readUrlParameters(input);
  }
  if (!(input instanceof Request)) {
    throw new TypeError("callback: input must be a string, a URL, or a Request");
  }
  assertBodyUnread(input, "callback");
  if (input.method === "GET" && !formPost) {
    return readUrlParameters(input.url);
  }
  if (input.method === "POST" && formPost) {
    return readFormParameters(input);
  }
  return invalidCallback(["callback", "method"]);
}

/**
 * Checks the `iss` of an authorization response (RFC 9207). A provider that advertises the parameter must
 * send it, so its absence is a failure as well as a wrong value.
 */
function issuerIssue(iss: string | undefined, options: ResolvedClientOptions): OidcIssue | undefined {
  const { tenant } = options;
  const mismatch =
    iss === undefined
      ? options.metadata.authorization_response_iss_parameter_supported === true
      : tenant === undefined
        ? iss !== options.metadata.issuer
        : !matchesTenantIssuer(iss, tenant);
  return mismatch ? { code: "iss_mismatch", path: ["callback", "iss"] } : undefined;
}

/** The response parameters the client did not read itself, such as the `user` Sign in with Apple posts. */
const otherParameters = (params: ReadonlyMap<string, string>): Readonly<Record<string, string>> =>
  Object.fromEntries([...params].filter(([name]) => !CONSUMED_PARAMETERS.has(name)));

/**
 * Finishes a sign-in: checks the callback against the pending state, exchanges the code, and validates the
 * ID token. The checks stop at the first failure, so nothing after a bad `state` runs. A plain OAuth 2.0 client
 * (`validate` undefined) has no ID token to validate.
 */
async function finishSignIn(
  options: ResolvedClientOptions,
  validate: IdTokenValidator | undefined,
  input: CallbackInput,
  pendingInput: PendingAuthorization,
): Promise<OidcResult<SignIn | OAuthSignIn>> {
  if (typeof input !== "string" && !(input instanceof URL) && !(input instanceof Request)) {
    throw new TypeError("callback: input must be a string, a URL, or a Request");
  }
  const redirectUri = requireRedirectUri(options, "callback");
  const pending = readPending(pendingInput, validate !== undefined);
  const parameters = await readCallbackParameters(input, pending);
  if (!parameters.ok) {
    return parameters;
  }
  const params = parameters.value;

  const state = params.get("state");
  if (state === undefined) {
    return invalidCallback(["callback", "state"]);
  }
  if (!timingSafeEqual(state, pending.state)) {
    return fail({ code: "state_mismatch", path: ["callback", "state"] });
  }

  const issuer = issuerIssue(params.get("iss"), options);
  if (issuer !== undefined) {
    return fail(issuer);
  }

  const error = params.get("error");
  if (error !== undefined) {
    return fail({ code: "provider_error", params: { endpoint: "authorization", error: readErrorCode(error) } });
  }

  const code = params.get("code");
  if (code === undefined) {
    return invalidCallback(["callback", "code"]);
  }

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: pending.codeVerifier,
  });
  const tokens = await requestTokens(options, form);
  if (!tokens.ok) {
    return tokens;
  }
  if (validate === undefined) {
    return ok({ tokens: tokens.value, parameters: otherParameters(params) });
  }
  const idToken = tokens.value.idToken;
  if (idToken === undefined) {
    return fail({ code: "invalid_token_response", path: ["response", "id_token"] });
  }
  const claims = await validate(idToken, {
    ...(pending.nonce === undefined ? {} : { nonce: pending.nonce }),
    ...(pending.maxAge === undefined || pending.requestedAt === undefined
      ? {}
      : { maxAge: { seconds: pending.maxAge, requestedAt: pending.requestedAt } }),
    accessToken: tokens.value.accessToken,
  });
  if (!claims.ok) {
    return claims;
  }
  return ok({ claims: claims.value, tokens: { ...tokens.value, idToken }, parameters: otherParameters(params) });
}

/**
 * Checks the claims of the ID token a refresh continues, which the app kept from the sign-in. It is the caller's own
 * data, so a malformed value throws, naming the member and never its value.
 */
function readPrevious(value: unknown): PreviousIdToken {
  if (!isObject(value)) {
    throw new TypeError("refresh: previous must be the claims of the ID token the session holds");
  }
  const iss = readRequiredString(value, "iss", "refresh: previous");
  const sub = readRequiredString(value, "sub", "refresh: previous");
  const aud = typeof value.aud === "string" ? value.aud : denseCopy(value.aud);
  if (aud === undefined || aud === "" || (Array.isArray(aud) && (aud.length === 0 || !aud.every(isNonEmptyString)))) {
    throw new TypeError("refresh: previous.aud must be a non-empty string or array of non-empty strings");
  }
  const { azp, auth_time: authTime, nonce } = value;
  if (azp !== undefined && typeof azp !== "string") {
    throw new TypeError("refresh: previous.azp must be a string when set");
  }
  if (authTime !== undefined && (typeof authTime !== "number" || !Number.isFinite(authTime))) {
    throw new TypeError("refresh: previous.auth_time must be a finite number when set");
  }
  if (nonce !== undefined && typeof nonce !== "string") {
    throw new TypeError("refresh: previous.nonce must be a string when set");
  }
  return {
    iss,
    sub,
    aud: aud as string | readonly string[],
    ...(azp === undefined ? {} : { azp }),
    ...(authTime === undefined ? {} : { auth_time: authTime }),
    ...(nonce === undefined ? {} : { nonce }),
  };
}

/** Checks the refresh request. A bad argument is a caller bug, so it throws. */
function readRefreshOptions(
  options: unknown,
  openid: boolean,
): {
  readonly refreshToken: string;
  readonly previous: PreviousIdToken | undefined;
  readonly scope: readonly string[] | undefined;
  readonly resource: readonly string[];
} {
  if (!isObject(options)) {
    throw new TypeError("refresh: options must be an object");
  }
  return {
    refreshToken: readRequiredString(options, "refreshToken", "refresh"),
    previous: openid ? readPrevious(options.previous) : undefined,
    scope: readScopeList(options.scope, "refresh"),
    resource: readResources(options.resource, "refresh"),
  };
}

/** Adds each `resource` (RFC 8707 §2) to a token request's form, as a parameter of its own. */
function appendResources(form: URLSearchParams, resources: readonly string[]): void {
  for (const resource of resources) {
    form.append("resource", resource);
  }
}

/**
 * Reads an optional scope list of a token request. Duplicates are dropped in first-seen order, as the authorization
 * request does, so the provider sees each scope once.
 */
function readScopeList(value: unknown, caller: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  // Copied by index, so a sparse or oversized array is refused rather than serialized.
  const scope = denseCopy(value);
  if (scope === undefined || scope.length === 0 || !scope.every(isScopeToken)) {
    throw new TypeError(`${caller}: scope must be a non-empty array of at most 100 scope tokens`);
  }
  const unique = [...new Set(scope as readonly string[])];
  if (unique.join(" ").length > MAX_PARAMETER_LENGTH) {
    throw new TypeError(`${caller}: scope is longer than the provider accepts`);
  }
  return unique;
}

/**
 * Exchanges a refresh token. An ID token in the response is validated against the one the session holds (OpenID
 * Connect Core §12.2), and not against the sign-in's nonce, since a refresh sends none. A plain OAuth 2.0 client
 * ignores any ID token.
 */
async function refreshTokens(
  options: ResolvedClientOptions,
  validate: IdTokenValidator | undefined,
  input: RefreshOptions,
): Promise<OidcResult<Refreshed>> {
  const request = readRefreshOptions(input, validate !== undefined);
  const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: request.refreshToken });
  if (request.scope !== undefined) {
    form.set("scope", request.scope.join(" "));
  }
  appendResources(form, request.resource);
  const tokens = await requestTokens(options, form);
  if (!tokens.ok) {
    return tokens;
  }
  const idToken = tokens.value.idToken;
  if (idToken === undefined || validate === undefined || request.previous === undefined) {
    return ok({ tokens: tokens.value });
  }
  const claims = await validate(idToken, {
    accessToken: tokens.value.accessToken,
    subject: request.previous.sub,
    previous: request.previous,
  });
  return claims.ok ? ok({ tokens: tokens.value, claims: claims.value }) : claims;
}

/**
 * Checks the client's auth method, and a client-assertion key's algorithm, against the provider's advertised
 * revocation-endpoint values. Revocation reuses the token endpoint's credentials, so a provider that lists
 * different ones for revocation would refuse the request. An absent member means the provider has not stated
 * them, so anything is accepted.
 */
function checkRevocationAuth(options: ResolvedClientOptions): void {
  const { metadata, auth } = options;
  const methods = metadata.revocation_endpoint_auth_methods_supported;
  if (methods !== undefined && !methods.includes(auth.method)) {
    throw new TypeError(
      "revoke: the client's auth method is not in metadata.revocation_endpoint_auth_methods_supported",
    );
  }
  if (auth.method !== "client_secret_jwt" && auth.method !== "private_key_jwt") {
    return;
  }
  const algorithms = metadata.revocation_endpoint_auth_signing_alg_values_supported;
  if (algorithms !== undefined && !algorithms.includes(auth.key.alg)) {
    throw new TypeError(
      "revoke: the key's algorithm is not in metadata.revocation_endpoint_auth_signing_alg_values_supported",
    );
  }
}

/**
 * Revokes a token. A bad argument, a provider without the endpoint, or revocation auth lists that omit the client's
 * method or its key's algorithm are caller bugs, so it throws.
 */
async function revokeToken(options: ResolvedClientOptions, input: RevokeOptions): Promise<OidcResult<void>> {
  if (!isObject(input)) {
    throw new TypeError("revoke: options must be an object");
  }
  const token = readRequiredString(input, "token", "revoke");
  const hint = input.tokenTypeHint;
  if (hint !== undefined && hint !== "access_token" && hint !== "refresh_token") {
    throw new TypeError('revoke: tokenTypeHint must be "access_token" or "refresh_token"');
  }
  const url = options.metadata.revocation_endpoint;
  if (url === undefined) {
    throw new TypeError("revoke: metadata has no revocation_endpoint");
  }
  checkRevocationAuth(options);
  const form = new URLSearchParams({ token });
  if (hint !== undefined) {
    form.set("token_type_hint", hint);
  }
  return requestRevocation(options, url, form);
}

async function requestClientToken(
  options: ResolvedClientOptions,
  input: ClientCredentialsOptions = {},
): Promise<OidcResult<TokenSet>> {
  if (!isObject(input)) {
    throw new TypeError("clientCredentials: options must be an object");
  }
  // RFC 6749 §4.4: only a client that authenticates may use this grant.
  if (options.auth.method === "none") {
    throw new TypeError("clientCredentials: a client whose auth.method is none cannot use client_credentials");
  }
  const grants = options.metadata.grant_types_supported;
  if (grants !== undefined && !grants.includes("client_credentials")) {
    throw new TypeError("clientCredentials: metadata.grant_types_supported does not list client_credentials");
  }
  const scope = readScopeList(input.scope, "clientCredentials");
  const resources = readResources(input.resource, "clientCredentials");
  const form = new URLSearchParams({ grant_type: "client_credentials" });
  if (scope !== undefined) {
    form.set("scope", scope.join(" "));
  }
  appendResources(form, resources);
  const tokens = await requestTokens(options, form);
  if (!tokens.ok || (tokens.value.idToken === undefined && tokens.value.refreshToken === undefined)) {
    return tokens;
  }
  // RFC 6749 §4.4.3: a refresh token SHOULD NOT be included, and no ID token is checked without a user.
  return ok(
    Object.fromEntries(
      Object.entries(tokens.value).filter(([name]) => name !== "idToken" && name !== "refreshToken"),
    ) as TokenSet,
  );
}

/**
 * Creates a relying party for one provider and one registered client.
 *
 * @remarks
 * With `openid: false`, the client is a plain OAuth 2.0 client, such as one for GitHub: it sends no nonce and needs
 * no `openid` scope, handles no ID token, and returns an {@link OAuthClient} whose results carry no claims.
 *
 * The client holds no per-user state. Between the redirect and the callback the app keeps the
 * {@link PendingAuthorization} that {@link Client.authorize} returned, in its own session. Every method
 * validates its input first and throws only for a caller's mistake; a response from the provider, or a URL
 * the browser was redirected to, comes back as a result, and never throws.
 *
 * The ID token's signature, and a logout token's, is checked against the provider's JWKS, which the client
 * fetches on first use and caches. Only the asymmetric algorithms this package supports, and that the provider advertises, are
 * accepted. An ID token signed with `none`, or with an HMAC secret, is never accepted.
 *
 * @param options - The provider metadata, the client's identifier, redirect URI, and authentication method.
 * Use {@link discover} to get the metadata from the issuer.
 * @returns A frozen client. Creating one makes no request.
 * @throws {TypeError} When `options` is invalid, such as a non-`https` endpoint, a `clientId` that is not a
 * non-empty string, or an auth method the provider does not advertise. The message names the option and
 * never its value.
 *
 * @example
 * ```ts
 * import { createClient, discover } from "@codenhub/oidc/client";
 *
 * const discovered = await discover("https://login.example.com");
 * if (!discovered.ok) throw new Error("provider unavailable");
 *
 * const client = createClient({
 *   metadata: discovered.value,
 *   clientId: "my-app",
 *   redirectUri: "https://app.example.com/callback",
 *   auth: { method: "none" },
 * });
 *
 * // Start: store `pending` in the session, then redirect the browser to `url`.
 * const { url, pending } = await client.authorize({ scope: ["openid", "profile"] });
 *
 * // Callback: pass the full URL the browser came back to, and the stored `pending`.
 * const signedIn = await client.callback(requestUrl, pending);
 * if (signedIn.ok) {
 *   console.log(signedIn.value.claims.sub);
 * }
 * ```
 */
export function createClient(options: ClientOptions): Client;
export function createClient(options: OAuthClientOptions): OAuthClient;
export function createClient(options: ClientOptions | OAuthClientOptions): Client | OAuthClient {
  const resolved = resolveClientOptions(options);
  const shared = (
    validate: IdTokenValidator | undefined,
    keys: ReturnType<typeof createProviderKeySet> | undefined,
  ) => ({
    metadata: resolved.metadata,
    authorize: (request?: AuthorizeOptions) => buildAuthorization(resolved, request),
    callback: (input: CallbackInput, pending: PendingAuthorization) => finishSignIn(resolved, validate, input, pending),
    refresh: (request: RefreshOptions) => refreshTokens(resolved, validate, request),
    userinfo: createUserinfoFetcher(resolved, keys),
    revoke: (request: RevokeOptions) => revokeToken(resolved, request),
    clientCredentials: (request?: ClientCredentialsOptions) => requestClientToken(resolved, request),
    endSessionUrl: (request?: EndSessionOptions) => buildEndSessionUrl(resolved, request),
  });
  if (!resolved.openid) {
    // No ID token, so no key set: the provider may have no JWKS, and nothing is ever fetched from one.
    return Object.freeze(shared(undefined, undefined)) as unknown as OAuthClient;
  }
  const keys = createProviderKeySet(resolved);
  const validate = createIdTokenValidator(resolved, keys);
  const verifyLogoutToken = createLogoutTokenValidator(resolved, keys);
  return Object.freeze({
    ...shared(validate, keys),
    verifyLogoutToken,
    readBackchannelLogout: (request: Request) => readBackchannelLogout(verifyLogoutToken, request),
  }) as unknown as Client;
}
