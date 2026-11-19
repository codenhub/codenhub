import {
  createRemoteKeySet,
  createVerifier,
  type JwtHeader,
  type JwtIssue,
  type JwtPayload,
  type KeySet,
  type VerifiedJwt,
} from "@codenhub/jwt";

import { timingSafeEqual } from "../shared/encoding";
import { MAX_ID_TOKEN_LENGTH } from "../shared/limits";
import { fail, ok } from "../shared/result";
import { computeTokenHash } from "../shared/token-hash";
import type { IdTokenClaims, OidcIssue, OidcResult } from "../shared/types";
import { tenantIssuerIssues } from "./issuer";
import type { ResolvedClientOptions } from "./options";
import type { PreviousIdToken } from "./types";

/** What an ID token must match for this sign-in, or for this refresh. Each member is checked only when set. */
export interface IdTokenExpectations {
  /** The nonce sent with the authorization request. The token must carry the same one. */
  readonly nonce?: string;
  /**
   * The `max_age` requested, as `seconds`, and when the request was made, as `requestedAt` in whole Unix seconds
   * (not the milliseconds `now()` returns). The token's `auth_time` must be no more than `seconds` plus the
   * client's `clockTolerance` before `requestedAt`.
   */
  readonly maxAge?: { readonly seconds: number; readonly requestedAt: number };
  /** The access token issued with the ID token, for `at_hash`. */
  readonly accessToken?: string;
  /** The `sub` the token must carry, such as the one a refresh continues. */
  readonly subject?: string;
  /**
   * The claims of the ID token a refresh continues (OpenID Connect Core §12.2): `iss`, `sub`, `aud` and `azp` must be
   * the same, `auth_time` too when both carry it, and a `nonce` is allowed only when it is the original one.
   */
  readonly previous?: PreviousIdToken;
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
  ["sid", isString],
];

/** The `typ` values of the provider's other JWTs: access tokens (RFC 9068 §2.1) and logout tokens (Back-Channel Logout 1.0 §2.4). */
const OTHER_TOKEN_TYPES: ReadonlySet<string> = new Set([AT_JWT, "logout+jwt"]);

/**
 * A `typ` names another token than an ID token when, lowercased and without an `application/` prefix, it is
 * `at+jwt` or `logout+jwt`.
 */
export const isOtherTokenType = (typ: string | undefined): boolean =>
  typ !== undefined && OTHER_TOKEN_TYPES.has(typ.toLowerCase().replace(APPLICATION_PREFIX, ""));

/** The payload claim an issue names, as its path: `["id_token", "payload", claim]`. */
const claimPath = (claim: string): OidcIssue["path"] => ["id_token", "payload", claim];

function invalidClaim(claim: string): OidcIssue {
  return {
    code: "invalid_id_token",
    path: claimPath(claim),
    params: { jwtCode: "invalid_claim" },
  };
}

/** Failed result from a non-empty issue list. The callers never pass an empty one. */
export function failAll(issues: readonly OidcIssue[]): OidcResult<never> {
  const [first, ...rest] = issues;
  if (first === undefined) {
    throw new Error("failAll: no issues");
  }
  return fail(first, ...rest);
}

/**
 * Maps every problem `@codenhub/jwt` found to an issue of `code`, under the token's name in the path. The JWT
 * code moves into `params`, so this package's own codes stay the only ones a caller branches on.
 */
export function fromJwtIssues(
  issues: readonly JwtIssue[],
  code: "invalid_id_token" | "invalid_logout_token" | "invalid_userinfo" = "invalid_id_token",
  token: "id_token" | "logout_token" | "userinfo" = "id_token",
): OidcResult<never> {
  return failAll(
    issues.map((issue) => ({
      code,
      path: [token, ...(issue.path ?? [])],
      params: { ...issue.params, jwtCode: issue.code },
    })),
  );
}

/**
 * `azp` is required when the audience has more than one value, and when present it must be this client (OpenID Connect Core §3.1.3.7).
 * A non-string `azp` is reported as its claim type, so it is not reported again here.
 */
export function azpIssues(
  payload: JwtPayload,
  clientId: string,
  token: "id_token" | "logout_token" = "id_token",
): OidcIssue[] {
  const multipleAudiences = Array.isArray(payload.aud) && payload.aud.length > 1;
  const azpMissing = payload.azp === undefined && multipleAudiences;
  const azpWrong = typeof payload.azp === "string" && payload.azp !== clientId;
  return azpMissing || azpWrong ? [{ code: "azp_mismatch", path: [token, "payload", "azp"] }] : [];
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

/** An audience as a set, since `"a"` and `["a"]` name the same one (RFC 7519 §4.1.3). */
function audienceSet(aud: unknown): ReadonlySet<unknown> {
  return new Set(Array.isArray(aud) ? aud : [aud]);
}

function sameAudience(left: unknown, right: unknown): boolean {
  const a = audienceSet(left);
  const b = audienceSet(right);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

/**
 * Checks a refreshed ID token against the one it continues (OpenID Connect Core §12.2). `sub` is checked with the
 * expected subject, and `nonce` with the expected nonce, so this covers the rest: a token for another issuer,
 * audience, party, or authentication is `id_token_mismatch`.
 */
function previousIssues(payload: JwtPayload, previous: PreviousIdToken): OidcIssue[] {
  const mismatch = (claim: string): OidcIssue => ({ code: "id_token_mismatch", path: claimPath(claim) });
  const issues: OidcIssue[] = [];
  if (payload.iss !== previous.iss) {
    issues.push(mismatch("iss"));
  }
  if (!sameAudience(payload.aud, previous.aud)) {
    issues.push(mismatch("aud"));
  }
  if (payload.azp !== previous.azp) {
    issues.push(mismatch("azp"));
  }
  const authTime = payload.auth_time;
  if (authTime !== undefined && previous.auth_time !== undefined && authTime !== previous.auth_time) {
    issues.push(mismatch("auth_time"));
  }
  // A refreshed token need not carry the nonce, but when it does it must be the original one (§12.2).
  if (payload.nonce !== undefined) {
    const matches =
      typeof payload.nonce === "string" &&
      previous.nonce !== undefined &&
      timingSafeEqual(payload.nonce, previous.nonce);
    if (!matches) {
      issues.push({ code: "nonce_mismatch", path: claimPath("nonce") });
    }
  }
  return issues;
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
  // An access or logout token must never pass as an ID token: all are signed by the same provider, so the
  // type is what tells them apart. A logout token has no nonce, so on refresh nothing else would refuse it.
  if (isOtherTokenType(header.typ)) {
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
  if (expected.previous !== undefined) {
    issues.push(...previousIssues(payload, expected.previous));
  }
  if (options.tenant !== undefined) {
    issues.push(...tenantIssuerIssues(payload, options.tenant, { code: "invalid_id_token", path: "id_token" }));
  }
  return issues;
}

/**
 * Creates the provider's remote key set for one client: its JWKS, fetched on first use and cached, limited to the
 * asymmetric algorithms the client accepts for ID tokens.
 */
export function createProviderKeySet(options: ResolvedClientOptions): KeySet {
  return createRemoteKeySet({
    url: options.metadata.jwks_uri,
    fetch: options.fetch,
    algorithms: options.idTokenAlgorithms,
    // The client's timeout is in milliseconds; the key set takes seconds.
    timeout: options.timeoutMs / MILLISECONDS_PER_SECOND,
    now: options.now,
  });
}

/**
 * Creates the function that validates ID tokens for one client. The key set and verifier are built once
 * here, so the JWKS is cached across sign-ins.
 *
 * @remarks
 * The signature must verify against a key the provider's JWKS publishes, with one of the asymmetric
 * algorithms both sides support. The issuer and audience must match, the token must not be expired, and
 * the claims the expectations name must match. With a `{tenantid}` issuer template, the issuer is the template with
 * the token's verified `tid` in place, which must be an allowed tenant. Every problem found is returned, not only the first.
 *
 * @param options - The resolved client options, supplying the issuer, client, clock, and JWKS endpoint.
 * @param keys - The provider's key set, shared with the logout token validator so the JWKS is fetched once.
 * @returns A function from a compact ID token and its expectations to the validated claims, or every issue.
 * It never throws for any token.
 */
export function createIdTokenValidator(
  options: ResolvedClientOptions,
  keys: KeySet = createProviderKeySet(options),
): IdTokenValidator {
  const verify = createVerifier({
    keys,
    // A `{tenantid}` template names no token's issuer, so `iss` is checked against it after the signature.
    ...(options.tenant === undefined ? { issuer: options.metadata.issuer } : {}),
    audience: options.clientId,
    clockTolerance: options.clockTolerance,
    requiredClaims: ["iss", "sub", "exp", "iat"],
    // A token with many claims, such as a user's groups, outgrows the verifier's 8192-character default, and refusing
    // it after the code is spent leaves the user unable to sign in. The token response that carries it is already
    // capped at `MAX_RESPONSE_BYTES`, which is also the verifier's ceiling.
    maxLength: MAX_ID_TOKEN_LENGTH,
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
