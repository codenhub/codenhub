import { digestKey } from "../shared/encoding";
import { releaseClaims } from "./claims";
import { refuse } from "./diagnostics";
import type { ResolvedOptions } from "./options";
import { bearerErrorResponse, jsonResponse, methodNotAllowed, preflightResponse } from "./responses";

/**
 * The `Authorization` header this endpoint accepts: the `Bearer` scheme in any letter case, one or more spaces
 * (RFC 6750 §2.1: `"Bearer" 1*SP`), then a token of the RFC 6750 §2.1 character set. Anything else is malformed.
 */
const BEARER_AUTHORIZATION = /^Bearer +([A-Za-z0-9\-._~+/]+=*)$/i;

const USERINFO_METHODS: readonly string[] = ["GET", "POST"];

/**
 * Answers the userinfo endpoint (OpenID Connect Core §5.3): the claims the access token's scopes release.
 *
 * @remarks
 * The token travels only in the `Authorization` header. A token in the body or query is not read, so a
 * credential never lands in a URL that a proxy or log would keep.
 *
 * @param options - Validated provider options.
 * @param request - The incoming request.
 * @returns The userinfo response, or a preflight or method error. Rejects only when the store or the
 * `claims` callback rejects.
 */
export async function handleUserinfo(options: ResolvedOptions, request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return preflightResponse(USERINFO_METHODS);
  }
  if (!USERINFO_METHODS.includes(request.method)) {
    return methodNotAllowed([...USERINFO_METHODS, "OPTIONS"]);
  }
  return answerWithAccessToken(options, request);
}

/** Reads the bearer token, looks up its record, and answers with the released claims. */
async function answerWithAccessToken(options: ResolvedOptions, request: Request): Promise<Response> {
  const header = request.headers.get("authorization");
  if (header === null) {
    return refuse(bearerErrorResponse(), "access_token_missing");
  }
  const match = BEARER_AUTHORIZATION.exec(header);
  const token = match?.[1];
  if (token === undefined) {
    return refuse(bearerErrorResponse("invalid_request"), "access_token_malformed");
  }

  // Looked up by digest in the access-token table only. An ID token or refresh token presented here is
  // never found, which is what stops one kind of token from being used as another.
  const record = await options.store.findAccessToken(await digestKey(token));
  if (record === undefined) {
    return refuse(bearerErrorResponse("invalid_token"), "access_token_unknown");
  }
  if (record.expiresAt <= options.now()) {
    return refuse(bearerErrorResponse("invalid_token"), "access_token_expired", record.clientId);
  }
  // OpenID Connect Core §5.3: the endpoint serves only tokens obtained with `openid`.
  if (!record.scopes.includes("openid")) {
    return refuse(bearerErrorResponse("insufficient_scope"), "access_token_without_openid", record.clientId);
  }

  return jsonResponse(await releaseClaims(options, record), { caching: "no-store" });
}
