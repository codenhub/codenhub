import { createVerifier, type JwtPayload, type KeySet } from "@codenhub/jwt";

import { MAX_RESPONSE_BYTES } from "../shared/limits";
import { fail, ok } from "../shared/result";
import type { OidcIssue, OidcResult, UserinfoClaims } from "../shared/types";
import { requestFailure, requestJson } from "./http";
import { failAll, fromJwtIssues, isOtherTokenType } from "./id-token";
import { tenantIssuerIssues } from "./issuer";
import type { ResolvedClientOptions } from "./options";
import type { OAuthUserinfoOptions, UserinfoOptions } from "./types";

const HTTP_OK = 200;
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;
/** A JWE in compact form has five segments (RFC 7516 §7.1); a JWS has three. */
const JWE_SEGMENTS = 5;

/** The function {@link createUserinfoFetcher} returns, for an OpenID client or a plain OAuth 2.0 one. */
export type UserinfoFetcher = {
  (input: UserinfoOptions): Promise<OidcResult<UserinfoClaims>>;
  (input: OAuthUserinfoOptions): Promise<OidcResult<Readonly<Record<string, unknown>>>>;
};

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value !== "";

/** Checks the userinfo request. A bad argument, or a provider without the endpoint, is a caller bug, so it throws. */
function readUserinfoOptions(
  options: unknown,
  openid: boolean,
): { readonly accessToken: string; readonly subject: string | undefined } {
  if (!isObject(options)) {
    throw new TypeError("userinfo: options must be an object");
  }
  const { accessToken, subject } = options;
  if (!isNonEmptyString(accessToken)) {
    throw new TypeError("userinfo: accessToken must be a non-empty string");
  }
  // The token goes into a header, which takes printable ASCII only; any other value would fail inside `fetch`
  // and be reported as a network failure. Token responses are held to the same rule.
  if (!PRINTABLE_ASCII.test(accessToken)) {
    throw new TypeError("userinfo: accessToken must be printable ASCII");
  }
  if (!openid) {
    return { accessToken, subject: undefined };
  }
  if (!isNonEmptyString(subject)) {
    throw new TypeError("userinfo: subject must be a non-empty string");
  }
  return { accessToken, subject };
}

/** The `sub` of the claims must be the subject the app already has (OpenID Connect Core §5.3.2). */
function subjectIssue(claims: Readonly<Record<string, unknown>>, subject: string): OidcIssue | undefined {
  if (typeof claims.sub !== "string") {
    return { code: "invalid_userinfo", path: ["userinfo", "sub"] };
  }
  return claims.sub === subject ? undefined : { code: "subject_mismatch", path: ["userinfo", "sub"] };
}

/**
 * Checks the claims of a verified userinfo JWT (OpenID Connect Core §5.3.2): `iss` is the provider's and `aud`
 * holds this client when present, and the token is not another of the provider's JWTs.
 */
function jwtClaimIssues(
  header: { readonly typ?: string },
  payload: JwtPayload,
  options: ResolvedClientOptions,
): OidcIssue[] {
  const issues: OidcIssue[] = [];
  if (isOtherTokenType(header.typ)) {
    issues.push({ code: "invalid_userinfo", path: ["userinfo", "header", "typ"], params: { jwtCode: "wrong_type" } });
  }
  if (payload.iss !== undefined) {
    if (options.tenant !== undefined) {
      issues.push(...tenantIssuerIssues(payload, options.tenant, { code: "invalid_userinfo", path: "userinfo" }));
    } else if (payload.iss !== options.metadata.issuer) {
      issues.push({
        code: "invalid_userinfo",
        path: ["userinfo", "payload", "iss"],
        params: { jwtCode: "wrong_issuer" },
      });
    }
  }
  const { aud } = payload;
  if (aud !== undefined && !(Array.isArray(aud) ? aud.includes(options.clientId) : aud === options.clientId)) {
    issues.push({
      code: "invalid_userinfo",
      path: ["userinfo", "payload", "aud"],
      params: { jwtCode: "wrong_audience" },
    });
  }
  return issues;
}

/**
 * Creates the function that fetches userinfo for one client.
 *
 * @remarks
 * An OpenID client accepts a JSON object or a signed JWT, which is verified with the ID token's keys and algorithms,
 * and in either case requires the `sub` the app already has. An encrypted JWT is refused as `invalid_userinfo` with
 * `reason: "encrypted"`, since this package holds no decryption key. A plain OAuth 2.0 client accepts a JSON object
 * only and returns it as it came, since such a provider promises no particular member.
 *
 * @param options - The resolved client options.
 * @param keys - The provider's key set, or `undefined` for a plain OAuth 2.0 client.
 */
export function createUserinfoFetcher(options: ResolvedClientOptions, keys: KeySet | undefined): UserinfoFetcher {
  const verify =
    keys === undefined
      ? undefined
      : createVerifier({
          keys,
          // A signed response may carry `aud` and `iss`, and need carry neither, nor `exp` (OpenID Connect Core
          // §5.3.2): jwtClaimIssues checks the first two when present, so @codenhub/jwt checks no audience and
          // requires no expiry, and still refuses an `exp` that has passed.
          audience: false,
          requireExpiration: false,
          clockTolerance: options.clockTolerance,
          // The response that carries it is already capped at this size.
          maxLength: MAX_RESPONSE_BYTES,
          now: options.now,
        });

  const readJwt = async (jwt: string, subject: string): Promise<OidcResult<UserinfoClaims>> => {
    if (verify === undefined) {
      return requestFailure("userinfo", "content_type");
    }
    if (jwt.split(".").length === JWE_SEGMENTS) {
      return fail({ code: "invalid_userinfo", path: ["userinfo"], params: { reason: "encrypted" } });
    }
    const verified = await verify(jwt);
    if (!verified.ok) {
      return fromJwtIssues(verified.error.issues, "invalid_userinfo", "userinfo");
    }
    const { header, payload } = verified.value;
    const wrongSubject = subjectIssue(payload, subject);
    const issues = [...jwtClaimIssues(header, payload, options), ...(wrongSubject === undefined ? [] : [wrongSubject])];
    return issues.length === 0 ? ok(payload as UserinfoClaims) : failAll(issues);
  };

  const fetchUserinfo = async (input: unknown): Promise<OidcResult<Readonly<Record<string, unknown>>>> => {
    const request = readUserinfoOptions(input, options.openid);
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
      acceptJwt: options.openid,
    });
    if (!response.ok) {
      return response;
    }
    const { status, body, jwt } = response.value;
    if (status !== HTTP_OK) {
      return requestFailure("userinfo", "status", status);
    }
    if (request.subject === undefined) {
      return ok(body);
    }
    if (jwt !== undefined) {
      return readJwt(jwt, request.subject);
    }
    const issue = subjectIssue(body, request.subject);
    return issue === undefined ? ok(body as UserinfoClaims) : fail(issue);
  };
  return fetchUserinfo as UserinfoFetcher;
}
