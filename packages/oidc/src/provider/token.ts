import { sign } from "@codenhub/jwt";

import { readBody } from "../shared/body";
import { digestKey, randomToken, timingSafeEqual } from "../shared/encoding";
import { MAX_BODY_BYTES } from "../shared/limits";
import { parseParameters } from "../shared/parameters";
import { computeCodeChallenge, isCodeVerifier } from "../shared/pkce";
import { computeTokenHash } from "../shared/token-hash";
import { authenticateClient } from "./client-auth";
import type { ResolvedOptions } from "./options";
import { jsonResponse, methodNotAllowed, preflightResponse, tokenErrorResponse } from "./responses";
import type { ClientRecord, CodeRecord, RefreshTokenRecord } from "./types";

const FORM_MEDIA_TYPE = "application/x-www-form-urlencoded";

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
 * Store rejections propagate, because a store that fails must not look like a refused request.
 *
 * @param options - The resolved provider options.
 * @param request - The request to the token endpoint.
 * @returns The token response or an error response.
 */
export async function handleToken(options: ResolvedOptions, request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return preflightResponse(["POST"]);
  }
  if (request.method !== "POST") {
    return methodNotAllowed(["POST", "OPTIONS"]);
  }
  if (!isFormContentType(request.headers.get("content-type"))) {
    return tokenErrorResponse("invalid_request");
  }
  const body = await readBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return tokenErrorResponse("invalid_request");
  }
  const parsed = parseParameters(body.text);
  if (!parsed.ok) {
    return tokenErrorResponse("invalid_request");
  }
  const parameters = parsed.parameters;
  const auth = await authenticateClient(options, request, parameters);
  if (!auth.ok) {
    return auth.response;
  }
  const grantType = parameters.get("grant_type");
  if (grantType === undefined) {
    return tokenErrorResponse("invalid_request");
  }
  switch (grantType) {
    case "authorization_code":
      return exchangeCode(options, auth.client, parameters);
    case "refresh_token":
      return refreshTokens(options, auth.client, parameters);
    default:
      return tokenErrorResponse("unsupported_grant_type");
  }
}

/**
 * Tests the request's `Content-Type` (RFC 6749 §4.1.3). Parameters are allowed only as a UTF-8 charset,
 * because the body is always decoded as UTF-8.
 */
function isFormContentType(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  const [mediaType, ...parameters] = value.split(";").map((part) => part.trim().toLowerCase());
  return (
    mediaType === FORM_MEDIA_TYPE && parameters.every((part) => part === "charset=utf-8" || part === 'charset="utf-8"')
  );
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
  if (code === undefined || redirectUri === undefined || verifier === undefined) {
    return tokenErrorResponse("invalid_request");
  }
  if (!isCodeVerifier(verifier)) {
    return tokenErrorResponse("invalid_grant");
  }
  const consumption = await options.store.consumeCode(await digestKey(code));
  if (consumption === undefined) {
    return tokenErrorResponse("invalid_grant");
  }
  if (consumption.status === "replayed") {
    await options.store.revokeGrant(consumption.grantId);
    return tokenErrorResponse("invalid_grant");
  }
  const record = consumption.record;
  if (!(await isRedeemable(options, client, record, redirectUri, verifier))) {
    return tokenErrorResponse("invalid_grant");
  }
  return issueFromCode(options, client, record);
}

/**
 * Checks everything a consumed code must satisfy. The code is already spent by the time this runs, so a
 * failure here still burns it: that is the safe direction.
 */
async function isRedeemable(
  options: ResolvedOptions,
  client: ClientRecord,
  record: CodeRecord,
  redirectUri: string,
  verifier: string,
): Promise<boolean> {
  if (record.expiresAt <= options.now()) {
    return false;
  }
  if (record.clientId !== client.clientId || record.redirectUri !== redirectUri) {
    return false;
  }
  return timingSafeEqual(await computeCodeChallenge(verifier), record.codeChallenge);
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
  const refreshToken = parameters.get("refresh_token");
  if (refreshToken === undefined) {
    return tokenErrorResponse("invalid_request");
  }
  // Checked before consumption, so a malformed or unknown scope does not burn the client's token. Only the
  // subset check below needs the record, and the store offers no read that does not consume.
  const requested = readRequestedScopes(parameters.get("scope"), options, client);
  if (requested === "invalid") {
    return tokenErrorResponse("invalid_scope");
  }
  const consumption = await options.store.consumeRefreshToken(await digestKey(refreshToken));
  if (consumption === undefined) {
    return tokenErrorResponse("invalid_grant");
  }
  if (consumption.status === "replayed") {
    await options.store.revokeGrant(consumption.grantId);
    return tokenErrorResponse("invalid_grant");
  }
  const record = consumption.record;
  if (record.expiresAt <= options.now() || record.clientId !== client.clientId) {
    return tokenErrorResponse("invalid_grant");
  }
  const scopes = requested ?? record.scopes;
  if (!scopes.every((scope) => record.scopes.includes(scope))) {
    return tokenErrorResponse("invalid_scope");
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

/** Saves a new access token for a grant and returns the token value; only its digest is stored. */
async function issueAccessToken(
  options: ResolvedOptions,
  grant: Grant,
  scopes: readonly string[],
  now: number,
): Promise<string> {
  const accessToken = randomToken();
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
