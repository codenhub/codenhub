import {
  createRemoteKeySet,
  createVerifier,
  type JwtHeader,
  type JwtIssue,
  type JwtPayload,
  type VerifiedJwt,
} from "@codenhub/jwt";

import { timingSafeEqual } from "../shared/encoding";
import { fail, ok } from "../shared/result";
import { computeTokenHash } from "../shared/token-hash";
import type { IdTokenClaims, OidcIssue, OidcResult } from "../shared/types";
import type { ResolvedClientOptions } from "./options";

/** What an ID token must match for this sign-in, or for this refresh. Each member is checked only when set. */
export interface IdTokenExpectations {
  /** The nonce sent with the authorization request. The token must carry the same one. */
  readonly nonce?: string;
  /**
   * The `max_age` requested, in seconds, and when the request was made. The token must carry an `auth_time` no
   * more than `maxAge` seconds before the request.
   */
  readonly maxAge?: { readonly seconds: number; readonly requestedAt: number };
  /** The access token issued with the ID token, for `at_hash`. */
  readonly accessToken?: string;
  /** The `sub` the token must carry, such as the one a refresh continues. */
  readonly subject?: string;
}

/** The validator {@link createIdTokenValidator} returns. */
export type IdTokenValidator = (idToken: string, expected: IdTokenExpectations) => Promise<OidcResult<IdTokenClaims>>;

const MILLISECONDS_PER_SECOND = 1000;
const AT_JWT = "at+jwt";
const APPLICATION_PREFIX = /^application\//;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value !== "";
const isString = (value: unknown): value is string => typeof value === "string";
const isStringArray = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(isString);

/** Each optional claim `IdTokenClaims` types, and the type it must have when present (OpenID Connect Core §2). */
const OPTIONAL_CLAIM_TYPES: readonly (readonly [string, (value: unknown) => boolean])[] = [
  ["acr", isString],
  ["amr", isStringArray],
  ["azp", isString],
  ["nonce", isString],
  ["at_hash", isString],
];

/** A `typ` names an access token when, lowercased and without an `application/` prefix, it is `at+jwt` (RFC 9068 §2.1). */
const isAccessTokenType = (typ: string | undefined): boolean =>
  typ !== undefined && typ.toLowerCase().replace(APPLICATION_PREFIX, "") === AT_JWT;

/** The payload claim an issue names, as its path: `["id_token", "payload", claim]`. */
const claimPath = (claim: string): OidcIssue["path"] => ["id_token", "payload", claim];

function invalidClaim(claim: string): OidcIssue {
  return { code: "invalid_id_token", path: claimPath(claim), params: { jwtCode: "invalid_claim" } };
}

/** Failed result from a non-empty issue list. The callers never pass an empty one. */
function failAll(issues: readonly OidcIssue[]): OidcResult<never> {
  const [first, ...rest] = issues;
  if (first === undefined) {
    throw new Error("failAll: no issues");
  }
  return fail(first, ...rest);
}

/**
 * Maps every problem `@codenhub/jwt` found to an `invalid_id_token` issue. The JWT code moves into
 * `params`, so this package's own codes stay the only ones a caller branches on.
 */
function fromJwtIssues(issues: readonly JwtIssue[]): OidcResult<never> {
  return failAll(
    issues.map((issue) => ({
      code: "invalid_id_token",
      path: ["id_token", ...(issue.path ?? [])],
      params: { ...issue.params, jwtCode: issue.code },
    })),
  );
}

/**
 * `azp` is required when the audience has more than one value, and when present it must be this client (OpenID Connect Core §3.1.3.7).
 * A non-string `azp` is reported as its claim type, so it is not reported again here.
 */
function azpIssues(payload: JwtPayload, clientId: string): OidcIssue[] {
  const multipleAudiences = Array.isArray(payload.aud) && payload.aud.length > 1;
  const azpMissing = payload.azp === undefined && multipleAudiences;
  const azpWrong = typeof payload.azp === "string" && payload.azp !== clientId;
  return azpMissing || azpWrong ? [{ code: "azp_mismatch", path: claimPath("azp") }] : [];
}

/** `auth_time` is optional, but when present it must be a number, and `max_age` makes it required. */
function authTimeIssues(
  payload: JwtPayload,
  expected: IdTokenExpectations,
  options: ResolvedClientOptions,
): OidcIssue[] {
  const authTime = payload.auth_time;
  if (authTime !== undefined) {
    if (typeof authTime !== "number" || !Number.isFinite(authTime)) {
      return [invalidClaim("auth_time")];
    }
  }
  if (expected.maxAge === undefined) {
    return [];
  }
  if (authTime === undefined) {
    return [{ code: "auth_time_missing", path: claimPath("auth_time") }];
  }
  // A non-number was reported above; judging its age here would only add a second issue for the same claim.
  if (typeof authTime !== "number" || !Number.isFinite(authTime)) {
    return [];
  }
  // Measured at the request, as the provider measures it (OpenID Connect Core §3.1.2.1): time the user spends
  // signing in does not count, and max_age=0 means an authentication after the request.
  const { seconds, requestedAt } = expected.maxAge;
  return requestedAt - authTime > seconds + options.clockTolerance
    ? [{ code: "auth_too_old", path: claimPath("auth_time") }]
    : [];
}

/** `at_hash` is optional in the code flow, so it is checked only when present and an access token is expected. */
async function atHashIssues(payload: JwtPayload, header: JwtHeader, accessToken: string): Promise<OidcIssue[]> {
  if (payload.at_hash === undefined) {
    return [];
  }
  const expectedHash = await computeTokenHash(accessToken, header.alg);
  const matches =
    typeof payload.at_hash === "string" && expectedHash !== undefined && timingSafeEqual(payload.at_hash, expectedHash);
  return matches ? [] : [{ code: "at_hash_mismatch", path: claimPath("at_hash") }];
}

/**
 * Checks the claims of a verified token against this client and this sign-in, collecting every failure.
 * The signature and the registered claims were already checked by the verifier.
 */
async function claimIssues(
  verified: VerifiedJwt,
  expected: IdTokenExpectations,
  options: ResolvedClientOptions,
): Promise<OidcIssue[]> {
  const { header, payload } = verified;
  const issues: OidcIssue[] = [];
  // An access token must never pass as an ID token: both are signed by the same provider, so the type is
  // the only thing that tells them apart.
  if (isAccessTokenType(header.typ)) {
    issues.push({
      code: "invalid_id_token",
      path: ["id_token", "header", "typ"],
      params: { jwtCode: "wrong_type" },
    });
  }
  if (!isNonEmptyString(payload.sub)) {
    issues.push(invalidClaim("sub"));
  }
  // A claim of the wrong type is reported once, here, and the checks that read it below skip it.
  const mistyped = new Set<string>();
  for (const [claim, isValid] of OPTIONAL_CLAIM_TYPES) {
    if (payload[claim] !== undefined && !isValid(payload[claim])) {
      mistyped.add(claim);
      issues.push(invalidClaim(claim));
    }
  }
  issues.push(...azpIssues(payload, options.clientId));
  if (expected.nonce !== undefined && !mistyped.has("nonce")) {
    const matches = typeof payload.nonce === "string" && timingSafeEqual(payload.nonce, expected.nonce);
    if (!matches) {
      issues.push({ code: "nonce_mismatch", path: claimPath("nonce") });
    }
  }
  issues.push(...authTimeIssues(payload, expected, options));
  if (expected.accessToken !== undefined && !mistyped.has("at_hash")) {
    issues.push(...(await atHashIssues(payload, header, expected.accessToken)));
  }
  // A `sub` that is empty or not a string is already reported as invalid_claim, so it is not compared as well.
  if (expected.subject !== undefined && isNonEmptyString(payload.sub) && payload.sub !== expected.subject) {
    issues.push({ code: "subject_mismatch", path: claimPath("sub") });
  }
  return issues;
}

/**
 * Creates the function that validates ID tokens for one client. The key set and verifier are built once
 * here, so the JWKS is cached across sign-ins.
 *
 * @remarks
 * The signature must verify against a key the provider's JWKS publishes, with one of the asymmetric
 * algorithms both sides support. The issuer and audience must match, the token must not be expired, and
 * the claims the expectations name must match. Every problem found is returned, not only the first.
 *
 * @param options - The resolved client options, supplying the issuer, client, clock, and JWKS endpoint.
 * @returns A function from a compact ID token and its expectations to the validated claims, or every issue.
 * It never throws for any token.
 */
export function createIdTokenValidator(options: ResolvedClientOptions): IdTokenValidator {
  const keys = createRemoteKeySet({
    url: options.metadata.jwks_uri,
    fetch: options.fetch,
    algorithms: options.idTokenAlgorithms,
    // The client's timeout is in milliseconds; the key set takes seconds.
    timeout: options.timeoutMs / MILLISECONDS_PER_SECOND,
    now: options.now,
  });
  const verify = createVerifier({
    keys,
    issuer: options.metadata.issuer,
    audience: options.clientId,
    clockTolerance: options.clockTolerance,
    requiredClaims: ["sub", "exp", "iat"],
    now: options.now,
  });
  return async (idToken, expected) => {
    const verified = await verify(idToken);
    if (!verified.ok) {
      return fromJwtIssues(verified.error.issues);
    }
    const issues = await claimIssues(verified.value, expected, options);
    return issues.length === 0 ? ok(verified.value.payload as IdTokenClaims) : failAll(issues);
  };
}
