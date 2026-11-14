import { sign } from "@codenhub/jwt";

import { assertBodyUnread, readBody } from "../shared/body";
import { isFormContentType } from "../shared/content-type";
import { digestKey, randomToken, timingSafeEqual } from "../shared/encoding";
import { MAX_BODY_BYTES } from "../shared/limits";
import { parseParameters } from "../shared/parameters";
import { computeCodeChallenge, isCodeVerifier } from "../shared/pkce";
import { computeTokenHash } from "../shared/token-hash";
import type { OAuthErrorCode } from "../shared/types";
import { ownDataValue, releaseClaims } from "./claims";
import { authenticateClient } from "./client-auth";
import { areResourcesOfClient, type CheckedClient, isScopeOfClient, lifetimesOf } from "./client-record";
import { refuse } from "./diagnostics";
import { PROTOCOL_SCOPES, type ResolvedOptions, type ResolvedTtl, selectIdTokenKey } from "./options";
import { jsonResponse, methodNotAllowed, preflightResponse, tokenErrorResponse } from "./responses";
import type {
  AccessTokenClaimsRequest,
  ClientRecord,
  CodeRecord,
  ProviderDiagnosticReason,
  RefreshTokenRecord,
} from "./types";

/** Claims the provider sets in every ID token it signs, which a scope's claims may never replace or add. */
const PROTOCOL_CLAIMS: ReadonlySet<string> = new Set([
  "iss",
  "sub",
  "aud",
  "exp",
  "iat",
  "auth_time",
  "nonce",
  "acr",
  "amr",
  "azp",
  "at_hash",
  "c_hash",
  "sid",
  "jti",
  "nbf",
  "events",
  "cnf",
]);

/**
 * Claims a JWT access token may carry that the provider sets or could set, which the app's `accessTokenClaims` may
 * never replace or add. Any other claim the token sets is dropped too, so this list need not keep up with the
 * payload.
 */
const ACCESS_TOKEN_CLAIMS: ReadonlySet<string> = new Set([
  "iss",
  "exp",
  "aud",
  "sub",
  "client_id",
  "iat",
  "jti",
  "scope",
  "auth_time",
  "acr",
  "amr",
  "nbf",
  "cnf",
  "azp",
]);

/** A token grant's identity and what it carries: enough to issue tokens for it again. */
interface Grant {
  readonly grantId: string;
  readonly clientId: string;
  readonly subject: string;
  readonly authTime: number;
  readonly amr?: readonly string[];
  readonly acr?: string;
  readonly sessionId?: string;
  /** The resource servers the grant covers (RFC 8707), from the authorization request. */
  readonly resources?: readonly string[];
}

/** A token request's `resource` values (RFC 8707 §2), or `undefined` when it sent none. */
type RequestedResources = readonly string[] | undefined;

/**
 * Answers the token endpoint (RFC 6749 §3.2): authenticates the client, then runs the grant it asked for.
 *
 * @remarks
 * Never throws for a request: every refusal is an OAuth error response with only `{ error }` in its body.
 * Store rejections propagate, because a store that fails must not look like a refused request, and a request
 * whose body was already read rejects with `TypeError`, since that is a bug in the calling code.
 *
 * @param options - The resolved provider options.
 * @param request - The request to the token endpoint.
 * @returns The token response or an error response.
 */
export async function handleToken(options: ResolvedOptions, request: Request): Promise<Response> {
  const read = await readClientRequest(options, request, ["resource"]);
  if (!read.ok) {
    return read.response;
  }
  const { client, parameters } = read;
  const resources = read.lists.get("resource");
  const grantType = parameters.get("grant_type");
  if (grantType === undefined) {
    return refuse(tokenErrorResponse("invalid_request"), "grant_type_missing", client.clientId);
  }
  const unauthorized = (): Response =>
    refuse(tokenErrorResponse("unauthorized_client"), "grant_type_unauthorized", client.clientId);
  switch (grantType) {
    // The refresh grant belongs to the code grant: it continues a sign-in that grant started.
    case "authorization_code":
    case "refresh_token":
      if (!client.grantTypes.includes("authorization_code")) {
        return unauthorized();
      }
      return grantType === "authorization_code"
        ? exchangeCode(options, client, parameters, resources)
        : refreshTokens(options, client, parameters, resources);
    case "client_credentials":
      return client.grantTypes.includes("client_credentials")
        ? issueForClient(options, client, parameters, resources)
        : unauthorized();
    default:
      return refuse(tokenErrorResponse("unsupported_grant_type"), "grant_type_unsupported", client.clientId);
  }
}

/** Outcome of {@link readClientRequest}: the authenticated client and its parameters, or the response to send. */
export type ClientRequestResult =
  | {
      readonly ok: true;
      readonly client: CheckedClient;
      readonly parameters: ReadonlyMap<string, string>;
      /** The values of each name in `repeatable` the request sent. */
      readonly lists: ReadonlyMap<string, readonly string[]>;
    }
  | { readonly ok: false; readonly response: Response };

/**
 * Reads a client's form POST to the token or revocation endpoint, cheapest and least trusting check first:
 * method, content type, body size, parameters (duplicates refused), then client authentication.
 *
 * @param options - The resolved provider options.
 * @param request - The request to the endpoint.
 * @param repeatable - The names that may repeat, whose values come back in `lists`.
 * @returns The authenticated client and its parameters, or the response that refuses the request.
 */
export async function readClientRequest(
  options: ResolvedOptions,
  request: Request,
  repeatable: readonly string[] = [],
): Promise<ClientRequestResult> {
  assertBodyUnread(request, "handle");
  if (request.method === "OPTIONS") {
    return { ok: false, response: preflightResponse(["POST"]) };
  }
  if (request.method !== "POST") {
    return { ok: false, response: methodNotAllowed(["POST", "OPTIONS"]) };
  }
  if (!isFormContentType(request.headers.get("content-type"))) {
    return { ok: false, response: refuse(tokenErrorResponse("invalid_request"), "content_type") };
  }
  const body = await readBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return { ok: false, response: refuse(tokenErrorResponse("invalid_request"), "body") };
  }
  const parsed = parseParameters(body.text, repeatable);
  if (!parsed.ok) {
    return { ok: false, response: refuse(tokenErrorResponse("invalid_request"), "parameters") };
  }
  const auth = await authenticateClient(options, request, parsed.parameters);
  return auth.ok ? { ok: true, client: auth.client, parameters: parsed.parameters, lists: parsed.lists } : auth;
}

/**
 * Redeems an authorization code (RFC 6749 §4.1.3). A code is single-use: presenting it again revokes every
 * token issued from it, since a replay means the code has leaked.
 */
async function exchangeCode(
  options: ResolvedOptions,
  client: CheckedClient,
  parameters: ReadonlyMap<string, string>,
  resources: RequestedResources,
): Promise<Response> {
  const code = parameters.get("code");
  const redirectUri = parameters.get("redirect_uri");
  const verifier = parameters.get("code_verifier");
  const refused = (error: OAuthErrorCode, reason: ProviderDiagnosticReason): Response =>
    refuse(tokenErrorResponse(error), reason, client.clientId);
  // A client that may skip PKCE can hold a code issued without a challenge, and only the record says which, so for
  // it the verifier's presence is checked after consumption, against the record.
  if (code === undefined || redirectUri === undefined || (verifier === undefined && client.requirePkce)) {
    return refused("invalid_request", "parameter_missing");
  }
  if (verifier !== undefined && !isCodeVerifier(verifier)) {
    return refused("invalid_grant", "code_verifier_malformed");
  }
  // Checked against the client before consumption, so a resource the client may never name does not burn the code.
  // Only the subset check below needs the record (decision 20).
  if (resources !== undefined && !areResourcesOfClient(client, resources)) {
    return refused("invalid_target", "resource_invalid");
  }
  const consumption = await options.store.consumeCode(await digestKey(code));
  if (consumption === undefined) {
    return refused("invalid_grant", "code_unknown");
  }
  if (consumption.status === "replayed") {
    await options.store.revokeGrant(consumption.grantId);
    return refused("invalid_grant", "code_replayed");
  }
  const record = consumption.record;
  const unredeemable = await whyUnredeemable(options, client, record, redirectUri, verifier);
  if (unredeemable !== undefined) {
    return refused("invalid_grant", unredeemable);
  }
  if (!isWithinGrant(resources, record.resources)) {
    return refused("invalid_target", "resource_not_granted");
  }
  return issueFromCode(options, client, record, resources);
}

/**
 * The resources of a family that the client's record still lists, in the family's order, or `undefined` when none
 * is left, so the token falls back as one for a grant without resources does. Narrowing to the current record means a
 * resource an admin removed stops being issued on the next refresh and comes back once it is listed again, as scopes
 * do; it only ever drops resources, so it cannot widen what the family covers.
 */
function resourcesOfClient(
  client: ClientRecord,
  resources: readonly string[] | undefined,
): readonly string[] | undefined {
  const listed = resources?.filter((resource) => client.resources?.includes(resource) === true);
  return listed === undefined || listed.length === 0 ? undefined : listed;
}

/** Whether a token request's resources are all ones the grant covers; a request that names none always is. */
function isWithinGrant(requested: RequestedResources, granted: readonly string[] | undefined): boolean {
  return requested === undefined || requested.every((resource) => granted?.includes(resource) === true);
}

/**
 * Checks everything a consumed code must satisfy, and returns why it fails, or `undefined` when it does not.
 * The code is already spent by the time this runs, so a failure here still burns it: that is the safe
 * direction.
 */
async function whyUnredeemable(
  options: ResolvedOptions,
  client: ClientRecord,
  record: CodeRecord,
  redirectUri: string,
  verifier: string | undefined,
): Promise<ProviderDiagnosticReason | undefined> {
  if (record.expiresAt <= options.now()) {
    return "code_expired";
  }
  if (record.clientId !== client.clientId) {
    return "code_client_mismatch";
  }
  if (record.redirectUri !== redirectUri) {
    return "redirect_uri_mismatch";
  }
  if (record.codeChallenge === undefined) {
    // Issued without a challenge, so no verifier can be right: one is a downgrade attempt (RFC 9700 §2.1.1).
    return verifier === undefined ? undefined : "code_verifier_unexpected";
  }
  if (verifier === undefined) {
    return "code_verifier_missing";
  }
  return timingSafeEqual(await computeCodeChallenge(verifier), record.codeChallenge)
    ? undefined
    : "code_verifier_mismatch";
}

/**
 * Issues the first tokens of a grant from a redeemed code, with a refresh token only under `offline_access`. The
 * access token is for the requested resources, or for every resource of the grant when the request named none.
 */
async function issueFromCode(
  options: ResolvedOptions,
  client: ClientRecord,
  record: CodeRecord,
  resources: RequestedResources,
): Promise<Response> {
  const now = options.now();
  const ttl = lifetimesOf(options.ttl, client);
  const grant: Grant = {
    grantId: record.grantId,
    clientId: client.clientId,
    subject: record.subject,
    authTime: record.authTime,
    ...optionalAuthContext(record),
    ...optionalSessionId(record),
    ...optionalResources(record),
  };
  const accessToken = await issueAccessToken(options, ttl, grant, record.scopes, resources ?? grant.resources, now);
  // Signed before the refresh token is saved, as at a refresh: the claims callback may fail, and a failure after the
  // save would leave a token the client never receives.
  const idToken = await issueIdToken(
    options,
    client,
    ttl,
    grant,
    accessToken,
    record.scopes,
    now,
    record.nonce === undefined ? {} : { nonce: record.nonce },
  );
  let refreshToken: string | undefined;
  if (record.scopes.includes("offline_access")) {
    refreshToken = randomToken();
    await options.store.saveRefreshToken(await digestKey(refreshToken), {
      ...grantRecord(grant),
      scopes: record.scopes,
      // Counted from this exchange, and never extended by rotation.
      expiresAt: now + ttl.refreshToken,
    });
  }
  return tokenResponse(ttl, { accessToken, scopes: record.scopes, idToken, refreshToken });
}

/**
 * Exchanges a refresh token for new tokens (RFC 6749 §6). Each refresh token is single-use and is replaced
 * by a new one in the same family. Reusing one revokes the family, since the old token may have leaked.
 */
async function refreshTokens(
  options: ResolvedOptions,
  client: ClientRecord,
  parameters: ReadonlyMap<string, string>,
  resources: RequestedResources,
): Promise<Response> {
  const refused = (error: OAuthErrorCode, reason: ProviderDiagnosticReason): Response =>
    refuse(tokenErrorResponse(error), reason, client.clientId);
  const refreshToken = parameters.get("refresh_token");
  if (refreshToken === undefined) {
    return refused("invalid_request", "parameter_missing");
  }
  // Checked before consumption, so a malformed or unknown scope does not burn the client's token. Only the
  // subset check below needs the record, and the store offers no read that does not consume.
  const requested = readRequestedScopes(parameters.get("scope"), client);
  if (requested === "invalid") {
    return refused("invalid_scope", "scope_invalid");
  }
  if (resources !== undefined && !areResourcesOfClient(client, resources)) {
    return refused("invalid_target", "resource_invalid");
  }
  const consumption = await options.store.consumeRefreshToken(await digestKey(refreshToken));
  if (consumption === undefined) {
    return refused("invalid_grant", "refresh_token_unknown");
  }
  if (consumption.status === "replayed") {
    await options.store.revokeGrant(consumption.grantId);
    return refused("invalid_grant", "refresh_token_replayed");
  }
  const record = consumption.record;
  if (record.expiresAt <= options.now()) {
    return refused("invalid_grant", "refresh_token_expired");
  }
  if (record.clientId !== client.clientId) {
    return refused("invalid_grant", "refresh_token_client_mismatch");
  }
  if (requested !== undefined && !requested.every((scope) => record.scopes.includes(scope))) {
    return refused("invalid_scope", "scope_not_granted");
  }
  if (!isWithinGrant(resources, record.resources)) {
    return refused("invalid_target", "resource_not_granted");
  }
  // Narrowed to what the client's record lists now, so a scope an admin removed stops being issued on the next
  // refresh, and comes back once it is listed again. A requested scope was already checked against the record.
  // The record of a client that refreshes lists `openid` (`checkClientRecord`), so narrowing never drops it.
  const scopes = requested ?? record.scopes.filter((scope) => isScopeOfClient(client, scope));
  if (options.onRefresh !== undefined && !(await isRefreshAllowed(options.onRefresh, record, scopes))) {
    // The family ends with this refusal, not only this request: a user who lost the entitlement must not
    // keep a token that could be refreshed again once the check passes.
    await options.store.revokeGrant(record.grantId);
    return refused("invalid_grant", "refresh_refused");
  }
  const now = options.now();
  const ttl = lifetimesOf(options.ttl, client);
  const grant: Grant = { ...grantRecord(record) };
  const accessToken = await issueAccessToken(
    options,
    ttl,
    grant,
    scopes,
    resources ?? resourcesOfClient(client, grant.resources),
    now,
  );
  // Signed before the next refresh token is saved: the claims callback may fail, and a failure after the save
  // would leave a token the client never receives. The spent token's retry is still a reuse (decision 55).
  const idToken = await issueIdToken(options, client, ttl, grant, accessToken, scopes, now, {});
  const nextRefreshToken = randomToken();
  await options.store.saveRefreshToken(await digestKey(nextRefreshToken), {
    ...grantRecord(record),
    // The family keeps its original scopes and resources, even when the request or the client's record narrowed
    // this response.
    scopes: record.scopes,
    expiresAt: record.expiresAt,
  });
  return tokenResponse(ttl, { accessToken, scopes, idToken, refreshToken: nextRefreshToken });
}

/**
 * Asks the app's `onRefresh` whether the family may still refresh, for the scopes this refresh will issue.
 *
 * @throws {TypeError} When the callback answers something that is not a boolean.
 */
async function isRefreshAllowed(
  onRefresh: NonNullable<ResolvedOptions["onRefresh"]>,
  record: RefreshTokenRecord,
  scopes: readonly string[],
): Promise<boolean> {
  const allowed = await onRefresh(
    Object.freeze({
      subject: record.subject,
      clientId: record.clientId,
      scopes: Object.freeze([...scopes]),
      grantId: record.grantId,
      ...optionalSessionId(record),
    }),
  );
  if (typeof allowed !== "boolean") {
    throw new TypeError("onRefresh must return a boolean or a promise of one");
  }
  return allowed;
}

/**
 * Reads a refresh request's `scope`: `undefined` when absent, `invalid` when empty, malformed, not allowed for the
 * client, or without `openid`. A scope the client's record lists is allowed whether or not the provider's `scopes`
 * option defines it. Every token this provider issues is an OpenID Connect token, so a refresh may narrow the scope
 * but never drop `openid`.
 */
function readRequestedScopes(
  requested: string | undefined,
  client: ClientRecord,
): readonly string[] | undefined | "invalid" {
  if (requested === undefined) {
    return undefined;
  }
  const asked = requested.split(" ");
  return asked.every((scope) => isScopeOfClient(client, scope)) && asked.includes("openid")
    ? [...new Set(asked)]
    : "invalid";
}

/**
 * Issues an access token to the client itself (RFC 6749 §4.4). No user is involved, so the token's subject is the
 * client, it carries neither `openid` nor `offline_access`, and no ID token or refresh token comes with it. Each
 * response is its own grant, so revoking one token leaves the client's other tokens alone.
 */
async function issueForClient(
  options: ResolvedOptions,
  client: ClientRecord,
  parameters: ReadonlyMap<string, string>,
  resources: RequestedResources,
): Promise<Response> {
  const scopes = readClientScopes(parameters.get("scope"), client);
  if (scopes === "invalid") {
    return refuse(tokenErrorResponse("invalid_scope"), "scope_invalid", client.clientId);
  }
  if (resources !== undefined && !areResourcesOfClient(client, resources)) {
    return refuse(tokenErrorResponse("invalid_target"), "resource_invalid", client.clientId);
  }
  const now = options.now();
  const ttl = lifetimesOf(options.ttl, client);
  const accessToken = await issueAccessToken(
    options,
    ttl,
    { grantId: randomToken(), clientId: client.clientId, subject: client.clientId },
    scopes,
    resources,
    now,
  );
  return jsonResponse(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ttl.accessToken,
      scope: scopes.join(" "),
    },
    { caching: "no-store" },
  );
}

/**
 * Reads a client credentials request's `scope`: when absent, every scope the client may request other than the
 * protocol ones; when present, scopes the client's record lists, none of them a protocol scope. A scope the
 * provider's `scopes` option does not define is allowed. `invalid` when that leaves no scope, or the request names
 * one it may not have.
 */
function readClientScopes(requested: string | undefined, client: ClientRecord): readonly string[] | "invalid" {
  const isAllowed = (scope: string): boolean => !PROTOCOL_SCOPES.includes(scope) && isScopeOfClient(client, scope);
  const scopes = requested === undefined ? client.scopes.filter(isAllowed) : requested.split(" ");
  return scopes.length > 0 && scopes.every(isAllowed) ? [...new Set(scopes)] : "invalid";
}

/**
 * Who an access token is for. A user's grant carries the authentication context, which a JWT access token repeats;
 * a client credentials token has none.
 */
type AccessTokenGrant = Pick<Grant, "grantId" | "clientId" | "subject"> &
  Partial<Pick<Grant, "authTime" | "amr" | "acr" | "sessionId">>;

/**
 * Saves a new access token for a grant and returns the token value; only its digest is stored, whatever its
 * format, so the userinfo and revocation endpoints find it the same way.
 *
 * The token is for `resources` when there are any. Otherwise a JWT access token is for the `accessToken.audience`
 * option, and an opaque one has no audience. The record keeps the audience, so it is checked the same way for both
 * formats.
 */
async function issueAccessToken(
  options: ResolvedOptions,
  ttl: ResolvedTtl,
  grant: AccessTokenGrant,
  scopes: readonly string[],
  resources: RequestedResources,
  now: number,
): Promise<string> {
  const { accessToken: format } = options;
  const audience = resources ?? (format.format === "jwt" ? [format.audience] : undefined);
  const accessToken =
    format.format === "jwt" && audience !== undefined
      ? await signAccessToken(options, ttl, audience, grant, scopes, now)
      : randomToken();
  await options.store.saveAccessToken(await digestKey(accessToken), {
    grantId: grant.grantId,
    clientId: grant.clientId,
    subject: grant.subject,
    scopes,
    ...optionalSessionId(grant),
    ...(audience === undefined ? {} : { audience }),
    expiresAt: now + ttl.accessToken,
  });
  return accessToken;
}

/**
 * Signs a JWT access token (RFC 9068 §2.2). Its `typ` of `at+jwt` is what keeps a resource server from taking an ID
 * token for it, and `jti` makes every token distinct, so its digest is a unique store key. `aud` is a string for one
 * audience and an array for several (RFC 7519 §4.1.3).
 */
async function signAccessToken(
  options: ResolvedOptions,
  ttl: ResolvedTtl,
  audience: readonly string[],
  grant: AccessTokenGrant,
  scopes: readonly string[],
  now: number,
): Promise<string> {
  const payload: Record<string, unknown> = {
    iss: options.issuer,
    exp: now + ttl.accessToken,
    aud: audience.length === 1 ? audience[0] : [...audience],
    sub: grant.subject,
    client_id: grant.clientId,
    iat: now,
    jti: randomToken(),
    scope: scopes.join(" "),
    ...(grant.authTime !== undefined ? { auth_time: grant.authTime } : {}),
    ...optionalAuthContext(grant),
  };
  const extra =
    options.accessTokenClaims === undefined
      ? {}
      : await appAccessTokenClaims(options.accessTokenClaims, payload, {
          subject: grant.subject,
          clientId: grant.clientId,
          scopes,
          audience,
          grantId: grant.grantId,
        });
  return sign({ payload: { ...extra, ...payload }, key: options.signingKey.privateKey, header: { typ: "at+jwt" } });
}

/**
 * The claims the app's `accessTokenClaims` adds, read as own enumerable data properties so a getter never runs,
 * minus every claim the provider sets or could set (decision 55's rule, applied to access tokens).
 *
 * @throws {TypeError} When the callback resolves to something that is not a plain object.
 */
async function appAccessTokenClaims(
  accessTokenClaims: NonNullable<ResolvedOptions["accessTokenClaims"]>,
  payload: Readonly<Record<string, unknown>>,
  request: AccessTokenClaimsRequest,
): Promise<Record<string, unknown>> {
  const returned: unknown = await accessTokenClaims(
    Object.freeze({
      ...request,
      scopes: Object.freeze([...request.scopes]),
      audience: Object.freeze([...request.audience]),
    }),
  );
  if (typeof returned !== "object" || returned === null || Array.isArray(returned)) {
    throw new TypeError("accessTokenClaims must return an object or a promise of one");
  }
  const entries: [string, unknown][] = [];
  for (const name of Object.keys(returned)) {
    const value = ownDataValue(returned, name);
    if (value !== undefined && !ACCESS_TOKEN_CLAIMS.has(name) && !Object.hasOwn(payload, name)) {
      entries.push([name, value]);
    }
  }
  // `Object.fromEntries` defines each property, so a claim named `__proto__` stays an ordinary one.
  return Object.fromEntries(entries);
}

/**
 * The claims of a client that wants its scope claims in the ID token, as userinfo would release them for the same
 * scopes, minus every claim a protocol claim of the token could be confused with. They are dropped by name, not
 * only replaced, so an `acr`, `nonce` or `sid` the token does not carry cannot be supplied by the callback either.
 */
async function releasedForIdToken(
  options: ResolvedOptions,
  grant: Grant,
  scopes: readonly string[],
): Promise<Record<string, unknown>> {
  const released = await releaseClaims(options, { subject: grant.subject, clientId: grant.clientId, scopes });
  return Object.fromEntries(Object.entries(released).filter(([name]) => !PROTOCOL_CLAIMS.has(name)));
}

/**
 * Signs an ID token (OpenID Connect Core §2) with the client's key. `at_hash` binds it to the access token issued
 * with it, and `nonce` appears only in the code flow, where the request carried one. For a client with
 * `idTokenClaims`, the claims the `scopes` release come with it.
 */
async function issueIdToken(
  options: ResolvedOptions,
  client: ClientRecord,
  ttl: ResolvedTtl,
  grant: Grant,
  accessToken: string,
  scopes: readonly string[],
  now: number,
  extra: { readonly nonce?: string },
): Promise<string> {
  const { privateKey } = selectIdTokenKey(options, client);
  const atHash = await computeTokenHash(accessToken, privateKey.alg);
  const scopeClaims = client.idTokenClaims === true ? await releasedForIdToken(options, grant, scopes) : {};
  return sign({
    payload: {
      // First, so a protocol claim below wins even if `releasedForIdToken` ever let one through.
      ...scopeClaims,
      iss: options.issuer,
      sub: grant.subject,
      aud: grant.clientId,
      iat: now,
      exp: now + ttl.idToken,
      auth_time: grant.authTime,
      ...optionalAuthContext(grant),
      ...(grant.sessionId !== undefined ? { sid: grant.sessionId } : {}),
      ...(extra.nonce !== undefined ? { nonce: extra.nonce } : {}),
      ...(atHash !== undefined ? { at_hash: atHash } : {}),
    },
    key: privateKey,
    header: { typ: "JWT" },
  });
}

/**
 * Builds the success response of the token endpoint (RFC 6749 §5.1), which must not be cached. `scope` is
 * the access token's scopes, which may be narrower than the family's.
 */
function tokenResponse(
  ttl: ResolvedTtl,
  tokens: {
    readonly accessToken: string;
    readonly scopes: readonly string[];
    readonly idToken: string;
    readonly refreshToken?: string;
  },
): Response {
  return jsonResponse(
    {
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: ttl.accessToken,
      id_token: tokens.idToken,
      ...(tokens.refreshToken !== undefined ? { refresh_token: tokens.refreshToken } : {}),
      scope: tokens.scopes.join(" "),
    },
    { caching: "no-store" },
  );
}

/** The authentication context an ID token or refresh record carries, omitting what is absent. */
function optionalAuthContext(source: { readonly amr?: readonly string[]; readonly acr?: string }): {
  readonly amr?: readonly string[];
  readonly acr?: string;
} {
  return {
    ...(source.amr !== undefined ? { amr: source.amr } : {}),
    ...(source.acr !== undefined ? { acr: source.acr } : {}),
  };
}

/** The session identifier a record or grant carries, omitting it when absent. */
function optionalSessionId(source: { readonly sessionId?: string }): { readonly sessionId?: string } {
  return source.sessionId !== undefined ? { sessionId: source.sessionId } : {};
}

/** The resource servers a record or grant covers, omitting them when absent. */
function optionalResources(source: { readonly resources?: readonly string[] }): {
  readonly resources?: readonly string[];
} {
  return source.resources !== undefined ? { resources: source.resources } : {};
}

/** The part of a refresh record that identifies its grant, without its scopes or lifetime. */
function grantRecord(source: Grant): Omit<RefreshTokenRecord, "scopes" | "expiresAt"> {
  return {
    grantId: source.grantId,
    clientId: source.clientId,
    subject: source.subject,
    authTime: source.authTime,
    ...optionalAuthContext(source),
    ...optionalSessionId(source),
    ...optionalResources(source),
  };
}
