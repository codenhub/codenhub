import { sign } from "@codenhub/jwt";

import { assertBodyUnread, readBody } from "../shared/body";
import { isFormContentType } from "../shared/content-type";
import { digestKey, randomToken, timingSafeEqual } from "../shared/encoding";
import { MAX_BODY_BYTES } from "../shared/limits";
import { parseParameters } from "../shared/parameters";
import { computeCodeChallenge, isCodeVerifier } from "../shared/pkce";
import { computeTokenHash } from "../shared/token-hash";
import type { OAuthErrorCode } from "../shared/types";
import { authenticateClient } from "./client-auth";
import type { CheckedClient } from "./client-record";
import { refuse } from "./diagnostics";
import { PROTOCOL_SCOPES, type ResolvedOptions } from "./options";
import { jsonResponse, methodNotAllowed, preflightResponse, tokenErrorResponse } from "./responses";
import type { ClientRecord, CodeRecord, ProviderDiagnosticReason, RefreshTokenRecord } from "./types";

/** A token grant's identity and what it carries: enough to issue tokens for it again. */
interface Grant {
  readonly grantId: string;
  readonly clientId: string;
  readonly subject: string;
  readonly authTime: number;
  readonly amr?: readonly string[];
  readonly acr?: string;
}

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
  const read = await readClientRequest(options, request);
  if (!read.ok) {
    return read.response;
  }
  const { client, parameters } = read;
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
        ? exchangeCode(options, client, parameters)
        : refreshTokens(options, client, parameters);
    case "client_credentials":
      return client.grantTypes.includes("client_credentials")
        ? issueForClient(options, client, parameters)
        : unauthorized();
    default:
      return refuse(tokenErrorResponse("unsupported_grant_type"), "grant_type_unsupported", client.clientId);
  }
}

/** Outcome of {@link readClientRequest}: the authenticated client and its parameters, or the response to send. */
export type ClientRequestResult =
  | { readonly ok: true; readonly client: CheckedClient; readonly parameters: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly response: Response };

/**
 * Reads a client's form POST to the token or revocation endpoint, cheapest and least trusting check first:
 * method, content type, body size, parameters (duplicates refused), then client authentication.
 *
 * @param options - The resolved provider options.
 * @param request - The request to the endpoint.
 * @returns The authenticated client and its parameters, or the response that refuses the request.
 */
export async function readClientRequest(options: ResolvedOptions, request: Request): Promise<ClientRequestResult> {
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
  const parsed = parseParameters(body.text);
  if (!parsed.ok) {
    return { ok: false, response: refuse(tokenErrorResponse("invalid_request"), "parameters") };
  }
  const auth = await authenticateClient(options, request, parsed.parameters);
  return auth.ok ? { ok: true, client: auth.client, parameters: parsed.parameters } : auth;
}

/**
 * Redeems an authorization code (RFC 6749 §4.1.3). A code is single-use: presenting it again revokes every
 * token issued from it, since a replay means the code has leaked.
 */
async function exchangeCode(
  options: ResolvedOptions,
  client: ClientRecord,
  parameters: ReadonlyMap<string, string>,
): Promise<Response> {
  const code = parameters.get("code");
  const redirectUri = parameters.get("redirect_uri");
  const verifier = parameters.get("code_verifier");
  const refused = (error: OAuthErrorCode, reason: ProviderDiagnosticReason): Response =>
    refuse(tokenErrorResponse(error), reason, client.clientId);
  if (code === undefined || redirectUri === undefined || verifier === undefined) {
    return refused("invalid_request", "parameter_missing");
  }
  if (!isCodeVerifier(verifier)) {
    return refused("invalid_grant", "code_verifier_malformed");
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
  return issueFromCode(options, client, record);
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
  verifier: string,
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
  return timingSafeEqual(await computeCodeChallenge(verifier), record.codeChallenge)
    ? undefined
    : "code_verifier_mismatch";
}

/** Issues the first tokens of a grant from a redeemed code, with a refresh token only under `offline_access`. */
async function issueFromCode(options: ResolvedOptions, client: ClientRecord, record: CodeRecord): Promise<Response> {
  const now = options.now();
  const grant: Grant = {
    grantId: record.grantId,
    clientId: client.clientId,
    subject: record.subject,
    authTime: record.authTime,
    ...optionalAuthContext(record),
  };
  const accessToken = await issueAccessToken(options, grant, record.scopes, now);
  let refreshToken: string | undefined;
  if (record.scopes.includes("offline_access")) {
    refreshToken = randomToken();
    await options.store.saveRefreshToken(await digestKey(refreshToken), {
      ...grantRecord(grant),
      scopes: record.scopes,
      // Counted from this exchange, and never extended by rotation.
      expiresAt: now + options.ttl.refreshToken,
    });
  }
  const idToken = await issueIdToken(
    options,
    grant,
    accessToken,
    now,
    record.nonce === undefined ? {} : { nonce: record.nonce },
  );
  return tokenResponse(options, { accessToken, scopes: record.scopes, idToken, refreshToken });
}

/**
 * Exchanges a refresh token for new tokens (RFC 6749 §6). Each refresh token is single-use and is replaced
 * by a new one in the same family. Reusing one revokes the family, since the old token may have leaked.
 */
async function refreshTokens(
  options: ResolvedOptions,
  client: ClientRecord,
  parameters: ReadonlyMap<string, string>,
): Promise<Response> {
  const refused = (error: OAuthErrorCode, reason: ProviderDiagnosticReason): Response =>
    refuse(tokenErrorResponse(error), reason, client.clientId);
  const refreshToken = parameters.get("refresh_token");
  if (refreshToken === undefined) {
    return refused("invalid_request", "parameter_missing");
  }
  // Checked before consumption, so a malformed or unknown scope does not burn the client's token. Only the
  // subset check below needs the record, and the store offers no read that does not consume.
  const requested = readRequestedScopes(parameters.get("scope"), options, client);
  if (requested === "invalid") {
    return refused("invalid_scope", "scope_invalid");
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
  const scopes = requested ?? record.scopes;
  if (!scopes.every((scope) => record.scopes.includes(scope))) {
    return refused("invalid_scope", "scope_not_granted");
  }
  const now = options.now();
  const grant: Grant = { ...grantRecord(record) };
  const accessToken = await issueAccessToken(options, grant, scopes, now);
  const nextRefreshToken = randomToken();
  await options.store.saveRefreshToken(await digestKey(nextRefreshToken), {
    ...grantRecord(record),
    // The family keeps its original scopes, even when this response narrowed them.
    scopes: record.scopes,
    expiresAt: record.expiresAt,
  });
  const idToken = await issueIdToken(options, grant, accessToken, now, {});
  return tokenResponse(options, { accessToken, scopes, idToken, refreshToken: nextRefreshToken });
}

/**
 * Reads a refresh request's `scope`: `undefined` when absent, `invalid` when empty, malformed, unknown to the
 * provider, not allowed for the client, or without `openid`. Every token this provider issues is an OpenID
 * Connect token, so a refresh may narrow the scope but never drop `openid`.
 */
function readRequestedScopes(
  requested: string | undefined,
  options: ResolvedOptions,
  client: ClientRecord,
): readonly string[] | undefined | "invalid" {
  if (requested === undefined) {
    return undefined;
  }
  const asked = requested.split(" ");
  const isKnown = (scope: string): boolean =>
    scope !== "" && options.scopeClaims.has(scope) && client.scopes.includes(scope);
  return asked.every(isKnown) && asked.includes("openid") ? [...new Set(asked)] : "invalid";
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
): Promise<Response> {
  const scopes = readClientScopes(parameters.get("scope"), options, client);
  if (scopes === "invalid") {
    return refuse(tokenErrorResponse("invalid_scope"), "scope_invalid", client.clientId);
  }
  const now = options.now();
  const accessToken = await issueAccessToken(
    options,
    { grantId: randomToken(), clientId: client.clientId, subject: client.clientId },
    scopes,
    now,
  );
  return jsonResponse(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: options.ttl.accessToken,
      scope: scopes.join(" "),
    },
    { caching: "no-store" },
  );
}

/**
 * Reads a client credentials request's `scope`: when absent, every scope the client may request other than the
 * protocol ones; when present, scopes the provider and the client both have, none of them a protocol scope.
 * `invalid` when that leaves no scope, or the request names one it may not have.
 */
function readClientScopes(
  requested: string | undefined,
  options: ResolvedOptions,
  client: ClientRecord,
): readonly string[] | "invalid" {
  const isAllowed = (scope: string): boolean =>
    scope !== "" && !PROTOCOL_SCOPES.includes(scope) && options.scopeClaims.has(scope) && client.scopes.includes(scope);
  const scopes = requested === undefined ? client.scopes.filter(isAllowed) : requested.split(" ");
  return scopes.length > 0 && scopes.every(isAllowed) ? [...new Set(scopes)] : "invalid";
}

/**
 * Who an access token is for. A user's grant carries the authentication context, which a JWT access token repeats;
 * a client credentials token has none.
 */
type AccessTokenGrant = Pick<Grant, "grantId" | "clientId" | "subject"> &
  Partial<Pick<Grant, "authTime" | "amr" | "acr">>;

/**
 * Saves a new access token for a grant and returns the token value; only its digest is stored, whatever its
 * format, so the userinfo and revocation endpoints find it the same way.
 */
async function issueAccessToken(
  options: ResolvedOptions,
  grant: AccessTokenGrant,
  scopes: readonly string[],
  now: number,
): Promise<string> {
  const accessToken =
    options.accessToken.format === "jwt"
      ? await signAccessToken(options, options.accessToken.audience, grant, scopes, now)
      : randomToken();
  await options.store.saveAccessToken(await digestKey(accessToken), {
    grantId: grant.grantId,
    clientId: grant.clientId,
    subject: grant.subject,
    scopes,
    expiresAt: now + options.ttl.accessToken,
  });
  return accessToken;
}

/**
 * Signs a JWT access token (RFC 9068 §2.2). Its `typ` of `at+jwt` is what keeps a resource server from taking an ID
 * token for it, and `jti` makes every token distinct, so its digest is a unique store key.
 */
function signAccessToken(
  options: ResolvedOptions,
  audience: string,
  grant: AccessTokenGrant,
  scopes: readonly string[],
  now: number,
): Promise<string> {
  return sign({
    payload: {
      iss: options.issuer,
      exp: now + options.ttl.accessToken,
      aud: audience,
      sub: grant.subject,
      client_id: grant.clientId,
      iat: now,
      jti: randomToken(),
      scope: scopes.join(" "),
      ...(grant.authTime !== undefined ? { auth_time: grant.authTime } : {}),
      ...optionalAuthContext(grant),
    },
    key: options.signingKey.privateKey,
    header: { typ: "at+jwt" },
  });
}

/**
 * Signs an ID token (OpenID Connect Core §2). `at_hash` binds it to the access token issued with it, and
 * `nonce` appears only in the code flow, where the request carried one.
 */
async function issueIdToken(
  options: ResolvedOptions,
  grant: Grant,
  accessToken: string,
  now: number,
  extra: { readonly nonce?: string },
): Promise<string> {
  const atHash = await computeTokenHash(accessToken, options.signingKey.privateKey.alg);
  return sign({
    payload: {
      iss: options.issuer,
      sub: grant.subject,
      aud: grant.clientId,
      iat: now,
      exp: now + options.ttl.idToken,
      auth_time: grant.authTime,
      ...optionalAuthContext(grant),
      ...(extra.nonce !== undefined ? { nonce: extra.nonce } : {}),
      ...(atHash !== undefined ? { at_hash: atHash } : {}),
    },
    key: options.signingKey.privateKey,
    header: { typ: "JWT" },
  });
}

/**
 * Builds the success response of the token endpoint (RFC 6749 §5.1), which must not be cached. `scope` is
 * the access token's scopes, which may be narrower than the family's.
 */
function tokenResponse(
  options: ResolvedOptions,
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
      expires_in: options.ttl.accessToken,
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

/** The part of a refresh record that identifies its grant, without its scopes or lifetime. */
function grantRecord(source: Grant): Omit<RefreshTokenRecord, "scopes" | "expiresAt"> {
  return {
    grantId: source.grantId,
    clientId: source.clientId,
    subject: source.subject,
    authTime: source.authTime,
    ...optionalAuthContext(source),
  };
}
