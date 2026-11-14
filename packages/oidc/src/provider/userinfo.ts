import { findBearerAccessToken } from "./bearer";
import { releaseClaims } from "./claims";
import { refuse } from "./diagnostics";
import type { ResolvedOptions } from "./options";
import { bearerErrorResponse, jsonResponse, methodNotAllowed, preflightResponse } from "./responses";

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

/** Looks up the bearer token's record and answers with the released claims. */
async function answerWithAccessToken(options: ResolvedOptions, request: Request): Promise<Response> {
  const lookup = await findBearerAccessToken(options, request);
  if (!lookup.ok) {
    const response =
      lookup.reason === "access_token_missing"
        ? bearerErrorResponse()
        : bearerErrorResponse(lookup.reason === "access_token_malformed" ? "invalid_request" : "invalid_token");
    return refuse(response, lookup.reason, lookup.clientId);
  }
  const { record } = lookup;
  // OpenID Connect Core §5.3: the endpoint serves only tokens obtained with `openid`.
  if (!record.scopes.includes("openid")) {
    return refuse(bearerErrorResponse("insufficient_scope"), "access_token_without_openid", record.clientId);
  }

  return jsonResponse(await releaseClaims(options, record), {
    caching: "no-store",
  });
}
