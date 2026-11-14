import { createVerifier, type JwtPayload, type KeySet } from "@codenhub/jwt";

import { assertBodyUnread, readBody } from "../shared/body";
import { isFormContentType } from "../shared/content-type";
import { MAX_BODY_BYTES } from "../shared/limits";
import { parseParameters } from "../shared/parameters";
import { fail, ok } from "../shared/result";
import type { OidcIssue, OidcResult } from "../shared/types";
import { azpIssues, failAll, fromJwtIssues } from "./id-token";
import type { ResolvedClientOptions } from "./options";
import type { BackchannelLogout } from "./types";

/** The validator {@link createLogoutTokenValidator} returns. */
export type LogoutTokenValidator = (logoutToken: string) => Promise<OidcResult<BackchannelLogout>>;

/** The event a logout token names (OpenID Connect Back-Channel Logout 1.0 §2.4). */
const BACKCHANNEL_LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

/** The `typ` a logout token carries (§2.4), which `@codenhub/jwt` compares without case or `application/`. */
const LOGOUT_TOKEN_TYPE = "logout+jwt";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value !== "";

/** A JSON object, as `JSON.parse` makes one: not `null` and not an array. */
const isJsonObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const claimIssue = (claim: string, jwtCode: "invalid_claim" | "missing_claim"): OidcIssue => ({
  code: "invalid_logout_token",
  path: ["logout_token", "payload", claim],
  params: { jwtCode },
});

/** `events` must hold the back-channel logout event, whose value is an object (§2.6 step 5). */
function eventsIssues(events: unknown): OidcIssue[] {
  const valid = isJsonObject(events) && Object.hasOwn(events, BACKCHANNEL_LOGOUT_EVENT);
  return valid && isJsonObject(events[BACKCHANNEL_LOGOUT_EVENT]) ? [] : [claimIssue("events", "invalid_claim")];
}

/**
 * The token names whose session ended through `sub`, `sid` or both (§2.4), each a non-empty string when present.
 * A client that requires the session gets a missing `sid` reported, which covers a token with neither.
 */
function subjectIssues(payload: JwtPayload, sessionRequired: boolean): OidcIssue[] {
  const issues: OidcIssue[] = [];
  // A non-string `sub` was reported by the verifier, so only an empty one is left to report here.
  if (payload.sub === "") {
    issues.push(claimIssue("sub", "invalid_claim"));
  }
  if (payload.sid !== undefined && !isNonEmptyString(payload.sid)) {
    issues.push(claimIssue("sid", "invalid_claim"));
  }
  if (payload.sid === undefined && (sessionRequired || payload.sub === undefined)) {
    // Without `sessionRequired`, either claim would do; `sid` is named because it is the one that says which session.
    issues.push(claimIssue("sid", "missing_claim"));
  }
  return issues;
}

/**
 * Checks the claims of a verified token that `@codenhub/jwt` does not, collecting every failure. The signature,
 * `typ`, `iss`, `aud`, `exp`, `iat` and the presence of `jti` and `events` were already checked by the verifier.
 */
function claimIssues(payload: JwtPayload, options: ResolvedClientOptions): OidcIssue[] {
  const issues: OidcIssue[] = [];
  // A non-string `jti` was reported by the verifier; an empty one identifies nothing to refuse a replay by.
  if (payload.jti === "") {
    issues.push(claimIssue("jti", "invalid_claim"));
  }
  issues.push(...eventsIssues(payload.events), ...subjectIssues(payload, options.logoutSessionRequired));
  // §2.4: a logout token MUST NOT carry a nonce, so an ID token signed with the right `typ` still fails.
  if (payload.nonce !== undefined) {
    issues.push(claimIssue("nonce", "invalid_claim"));
  }
  issues.push(...azpIssues(payload, options.clientId, "logout_token"));
  return issues;
}

/**
 * Creates the function that verifies logout tokens for one client (OpenID Connect Back-Channel Logout 1.0 §2.6).
 *
 * @remarks
 * The verifier shares the ID token validator's key set, so the JWKS is fetched and cached once, and accepts the
 * same algorithms. `typ: "logout+jwt"` is required: the provider of this package always sets it, and it is the
 * check that keeps an ID token or an access token signed by the same keys from passing.
 *
 * @param options - The resolved client options, supplying the issuer, client, clock and `sessionRequired`.
 * @param keys - The provider's key set.
 * @returns A function from a compact logout token to who signed out, or every issue. It throws only for a
 * `logoutToken` that is not a string.
 */
export function createLogoutTokenValidator(options: ResolvedClientOptions, keys: KeySet): LogoutTokenValidator {
  const verify = createVerifier({
    keys,
    issuer: options.metadata.issuer,
    audience: options.clientId,
    type: LOGOUT_TOKEN_TYPE,
    clockTolerance: options.clockTolerance,
    requiredClaims: ["iat", "exp", "jti", "events"],
    now: options.now,
  });
  return async (logoutToken) => {
    if (typeof logoutToken !== "string") {
      throw new TypeError("verifyLogoutToken: logoutToken must be a string");
    }
    const verified = await verify(logoutToken);
    if (!verified.ok) {
      return fromJwtIssues(verified.error.issues, "invalid_logout_token", "logout_token");
    }
    const { payload } = verified.value;
    const issues = claimIssues(payload, options);
    if (issues.length > 0) {
      return failAll(issues);
    }
    // The verifier checked the types of `iat`, `exp` and `jti`, and `claimIssues` those of `sub` and `sid`.
    const { sub, sid } = payload as { readonly sub?: string; readonly sid?: string };
    return ok({
      ...(sub === undefined ? {} : { subject: sub }),
      ...(sid === undefined ? {} : { sessionId: sid }),
      jti: payload.jti as string,
      issuedAt: payload.iat as number,
      expiresAt: payload.exp as number,
    });
  };
}

/** An `invalid_logout_request` issue at a part of the request, with the parameter failure when there is one. */
const invalidRequest = (path: readonly string[], reason?: string): OidcResult<never> =>
  fail(
    reason === undefined
      ? { code: "invalid_logout_request", path }
      : { code: "invalid_logout_request", path, params: { reason } },
  );

/**
 * Reads a back-channel logout request (§2.5) and verifies its token. The checks stop at the first failure of the
 * request, so a token is verified only when it arrived as the specification says it must.
 *
 * @throws {TypeError} When the request's body was already read.
 */
export async function readBackchannelLogout(
  verify: LogoutTokenValidator,
  request: Request,
): Promise<OidcResult<BackchannelLogout>> {
  assertBodyUnread(request, "readBackchannelLogout");
  if (request.method !== "POST") {
    return invalidRequest(["request", "method"]);
  }
  if (!isFormContentType(request.headers.get("content-type"))) {
    return invalidRequest(["request", "headers", "content-type"]);
  }
  const body = await readBody(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return invalidRequest(["request", "body"], body.reason);
  }
  const parsed = parseParameters(body.text);
  if (!parsed.ok) {
    return invalidRequest(["request", "body"], parsed.reason);
  }
  const logoutToken = parsed.parameters.get("logout_token");
  if (logoutToken === undefined) {
    return invalidRequest(["request", "body", "logout_token"]);
  }
  return verify(logoutToken);
}
