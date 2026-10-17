import { timingSafeEqual } from "../shared/encoding";
import { MAX_PARAMETER_LENGTH, MAX_URL_LENGTH } from "../shared/limits";
import { parseParameters } from "../shared/parameters";
import { fail, ok } from "../shared/result";
import type { OidcIssue, OidcResult, UserinfoClaims } from "../shared/types";
import { buildAuthorization, denseCopy } from "./authorize";
import { readErrorCode, requestFailure, requestJson } from "./http";
import { createIdTokenValidator, type IdTokenValidator } from "./id-token";
import { type ResolvedClientOptions, resolveClientOptions } from "./options";
import { requestRevocation, requestTokens } from "./tokens";
import type {
  AuthorizeOptions,
  Client,
  ClientOptions,
  PendingAuthorization,
  Refreshed,
  RefreshOptions,
  SignIn,
  RevokeOptions,
  UserinfoOptions,
} from "./types";

const HTTP_OK = 200;

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
 * a malformed value is a caller bug and throws; the names of the members are the only thing reported.
 */
function readPending(pending: unknown): PendingAuthorization {
  if (!isObject(pending)) {
    throw new TypeError("callback: pending must be an object");
  }
  const state = readRequiredString(pending, "state", "callback: pending");
  const nonce = readRequiredString(pending, "nonce", "callback: pending");
  const codeVerifier = readRequiredString(pending, "codeVerifier", "callback: pending");
  const { maxAge } = pending;
  if (maxAge !== undefined && !isNonNegativeInteger(maxAge)) {
    throw new TypeError("callback: pending.maxAge must be a non-negative integer");
  }
  return { state, nonce, codeVerifier, ...(maxAge === undefined ? {} : { maxAge: maxAge as number }) };
}

/** An `invalid_callback` issue at the callback URL, with optional facts about why. */
const invalidCallback = (path: readonly string[], params?: Readonly<Record<string, string>>): OidcResult<never> =>
  fail(params === undefined ? { code: "invalid_callback", path } : { code: "invalid_callback", path, params });

/**
 * Reads the parameters of the callback URL. The query is the only place a provider's response goes here,
 * because this client uses the `query` response mode.
 */
function readCallbackParameters(url: string | URL): OidcResult<ReadonlyMap<string, string>> {
  const text = url instanceof URL ? url.href : url;
  if (text.length > MAX_URL_LENGTH || !URL.canParse(text)) {
    return invalidCallback(["callback"]);
  }
  const parsed = parseParameters(new URL(text).search.slice(1));
  return parsed.ok ? ok(parsed.parameters) : invalidCallback(["callback"], { reason: parsed.reason });
}

/**
 * Checks the `iss` of an authorization response (RFC 9207). A provider that advertises the parameter must
 * send it, so its absence is a failure as well as a wrong value.
 */
function issuerIssue(iss: string | undefined, options: ResolvedClientOptions): OidcIssue | undefined {
  const mismatch =
    iss === undefined
      ? options.metadata.authorization_response_iss_parameter_supported === true
      : iss !== options.metadata.issuer;
  return mismatch ? { code: "iss_mismatch", path: ["callback", "iss"] } : undefined;
}

/**
 * Finishes a sign-in: checks the callback against the pending state, exchanges the code, and validates the
 * ID token. The checks stop at the first failure, so nothing after a bad `state` runs.
 */
async function finishSignIn(
  options: ResolvedClientOptions,
  validate: IdTokenValidator,
  url: string | URL,
  pendingInput: PendingAuthorization,
): Promise<OidcResult<SignIn>> {
  if (typeof url !== "string" && !(url instanceof URL)) {
    throw new TypeError("callback: url must be a string or URL");
  }
  const pending = readPending(pendingInput);
  const parameters = readCallbackParameters(url);
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
    redirect_uri: options.redirectUri,
    code_verifier: pending.codeVerifier,
  });
  const tokens = await requestTokens(options, form);
  if (!tokens.ok) {
    return tokens;
  }
  const idToken = tokens.value.idToken;
  if (idToken === undefined) {
    return fail({ code: "invalid_token_response", path: ["response", "id_token"] });
  }
  const claims = await validate(idToken, {
    nonce: pending.nonce,
    maxAge: pending.maxAge,
    accessToken: tokens.value.accessToken,
  });
  if (!claims.ok) {
    return claims;
  }
  return ok({ claims: claims.value, tokens: { ...tokens.value, idToken } });
}

/** Checks the refresh request. A bad argument is a caller bug, so it throws. */
function readRefreshOptions(options: unknown): {
  readonly refreshToken: string;
  readonly subject: string;
  readonly scope: readonly string[] | undefined;
} {
  if (!isObject(options)) {
    throw new TypeError("refresh: options must be an object");
  }
  // Copied by index, so a sparse or oversized array is refused rather than serialized.
  const scope = options.scope === undefined ? undefined : denseCopy(options.scope);
  if (options.scope !== undefined && (scope === undefined || scope.length === 0 || !scope.every(isScopeToken))) {
    throw new TypeError("refresh: scope must be a non-empty array of at most 100 scope tokens");
  }
  const unique = scope === undefined ? undefined : [...new Set(scope as readonly string[])];
  if (unique !== undefined && unique.join(" ").length > MAX_PARAMETER_LENGTH) {
    throw new TypeError("refresh: scope is longer than the provider accepts");
  }
  return {
    refreshToken: readRequiredString(options, "refreshToken", "refresh"),
    subject: readRequiredString(options, "subject", "refresh"),
    // Duplicates are dropped in first-seen order, as the authorization request does, so the provider sees each scope once.
    scope: unique,
  };
}

/**
 * Exchanges a refresh token. An ID token in the response is validated against the subject the app
 * already has, and not against a nonce, since a refresh has none.
 */
async function refreshTokens(
  options: ResolvedClientOptions,
  validate: IdTokenValidator,
  input: RefreshOptions,
): Promise<OidcResult<Refreshed>> {
  const request = readRefreshOptions(input);
  const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: request.refreshToken });
  if (request.scope !== undefined) {
    form.set("scope", request.scope.join(" "));
  }
  const tokens = await requestTokens(options, form);
  if (!tokens.ok) {
    return tokens;
  }
  const idToken = tokens.value.idToken;
  if (idToken === undefined) {
    return ok({ tokens: tokens.value });
  }
  const claims = await validate(idToken, { accessToken: tokens.value.accessToken, subject: request.subject });
  return claims.ok ? ok({ tokens: tokens.value, claims: claims.value }) : claims;
}

/** Checks the userinfo request. A bad argument, or a provider without the endpoint, is a caller bug, so it throws. */
function readUserinfoOptions(options: UserinfoOptions): { readonly accessToken: string; readonly subject: string } {
  if (!isObject(options)) {
    throw new TypeError("userinfo: options must be an object");
  }
  return {
    accessToken: readRequiredString(options, "accessToken", "userinfo"),
    subject: readRequiredString(options, "subject", "userinfo"),
  };
}

/**
 * Fetches the userinfo claims. The response's `sub` must equal the subject the app already has
 * (OpenID Connect Core §5.3.2), so claims about another user are refused.
 */
async function fetchUserinfo(
  options: ResolvedClientOptions,
  input: UserinfoOptions,
): Promise<OidcResult<UserinfoClaims>> {
  const request = readUserinfoOptions(input);
  const url = options.metadata.userinfo_endpoint;
  if (url === undefined) {
    throw new TypeError("userinfo: metadata has no userinfo_endpoint");
  }
  const response = await requestJson({
    endpoint: "userinfo",
    url,
    method: "GET",
    headers: { authorization: `Bearer ${request.accessToken}` },
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
  });
  if (!response.ok) {
    return response;
  }
  if (response.value.status !== HTTP_OK) {
    return requestFailure("userinfo", "status", response.value.status);
  }
  const claims = response.value.body;
  if (typeof claims.sub !== "string") {
    return fail({ code: "invalid_userinfo", path: ["userinfo", "sub"] });
  }
  if (claims.sub !== request.subject) {
    return fail({ code: "subject_mismatch", path: ["userinfo", "sub"] });
  }
  return ok(claims as UserinfoClaims);
}

/** Revokes a token. A bad argument, or a provider without the endpoint, is a caller bug, so it throws. */
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
  const form = new URLSearchParams({ token });
  if (hint !== undefined) {
    form.set("token_type_hint", hint);
  }
  return requestRevocation(options, url, form);
}

/**
 * Creates a relying party for one provider and one registered client.
 *
 * @remarks
 * The client holds no per-user state. Between the redirect and the callback the app keeps the
 * {@link PendingAuthorization} that {@link Client.authorize} returned, in its own session. Every method
 * validates its input first and throws only for a caller's mistake; a response from the provider, or a URL
 * the browser was redirected to, comes back as a result, and never throws.
 *
 * The ID token's signature is checked against the provider's JWKS, which the client fetches on first use
 * and caches. Only the asymmetric algorithms this package supports, and that the provider advertises, are
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
export function createClient(options: ClientOptions): Client {
  const resolved = resolveClientOptions(options);
  const validate = createIdTokenValidator(resolved);
  return Object.freeze({
    metadata: resolved.metadata,
    authorize: (request?: AuthorizeOptions) => buildAuthorization(resolved, request),
    callback: (url: string | URL, pending: PendingAuthorization) => finishSignIn(resolved, validate, url, pending),
    refresh: (request: RefreshOptions) => refreshTokens(resolved, validate, request),
    userinfo: (request: UserinfoOptions) => fetchUserinfo(resolved, request),
    revoke: (request: RevokeOptions) => revokeToken(resolved, request),
  });
}
