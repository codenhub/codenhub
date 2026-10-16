import { fail, ok } from "../shared/result";
import type { OidcIssue, OidcResult } from "../shared/types";
import { authenticate } from "./client-auth";
import { readErrorCode, requestFailure, requestJson } from "./http";
import type { ResolvedClientOptions } from "./options";
import type { TokenSet } from "./types";

const HTTP_OK = 200;
const MILLISECONDS_PER_SECOND = 1000;
const BEARER = "bearer";
const SPACE = " ";

/** A member of the token response, or `undefined` when it is absent. `Object.hasOwn` keeps inherited names out. */
const member = (body: Readonly<Record<string, unknown>>, name: string): unknown =>
  Object.hasOwn(body, name) ? body[name] : undefined;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value !== "";

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** One `invalid_token_response` issue, naming the member that is missing or invalid. */
const invalidMember = (name: string): OidcIssue => ({ code: "invalid_token_response", path: ["response", name] });

/**
 * Collects every problem with the token response, so a provider that gets several members wrong is
 * reported in one result. The checks are the ones RFC 6749 §5.1 and OpenID Connect Core §3.1.3.3 state.
 */
function tokenResponseIssues(body: Readonly<Record<string, unknown>>): OidcIssue[] {
  const issues: OidcIssue[] = [];
  const accessToken = member(body, "access_token");
  if (!isNonEmptyString(accessToken)) {
    issues.push(invalidMember("access_token"));
  }
  const tokenType = member(body, "token_type");
  // RFC 6749 §7.1: the scheme name is case-insensitive. Any other type is one this client cannot use.
  if (typeof tokenType !== "string" || tokenType.toLowerCase() !== BEARER) {
    issues.push(invalidMember("token_type"));
  }
  if (Object.hasOwn(body, "expires_in") && !isNonNegativeNumber(member(body, "expires_in"))) {
    issues.push(invalidMember("expires_in"));
  }
  if (Object.hasOwn(body, "refresh_token") && !isNonEmptyString(member(body, "refresh_token"))) {
    issues.push(invalidMember("refresh_token"));
  }
  if (Object.hasOwn(body, "id_token") && !isNonEmptyString(member(body, "id_token"))) {
    issues.push(invalidMember("id_token"));
  }
  if (Object.hasOwn(body, "scope") && typeof member(body, "scope") !== "string") {
    issues.push(invalidMember("scope"));
  }
  return issues;
}

/** Failed result from a non-empty issue list. The callers never pass an empty one. */
function failAll(issues: readonly OidcIssue[]): OidcResult<never> {
  const [first, ...rest] = issues;
  if (first === undefined) {
    throw new Error("failAll: no issues");
  }
  return fail(first, ...rest);
}

/** Splits a space-delimited `scope` value, dropping the empty pieces that repeated spaces leave. */
const splitScope = (scope: string): string[] => scope.split(SPACE).filter((token) => token !== "");

/**
 * Turns a token response the checks accepted into a {@link TokenSet}. The expiry is computed here, from
 * the clock at receipt, so later callers compare against one fixed instant.
 */
function toTokenSet(body: Readonly<Record<string, unknown>>, now: () => number): TokenSet {
  const accessToken = body.access_token as string;
  const expiresIn = member(body, "expires_in") as number | undefined;
  const refreshToken = member(body, "refresh_token") as string | undefined;
  const idToken = member(body, "id_token") as string | undefined;
  const scope = member(body, "scope") as string | undefined;
  return {
    accessToken,
    tokenType: "Bearer",
    ...(expiresIn === undefined
      ? {}
      : { expiresAt: Math.floor(now() / MILLISECONDS_PER_SECOND) + Math.floor(expiresIn) }),
    ...(refreshToken === undefined ? {} : { refreshToken }),
    ...(idToken === undefined ? {} : { idToken }),
    ...(scope === undefined ? {} : { scope: splitScope(scope) }),
  };
}

/**
 * Sends a request to the token endpoint, authenticated as the client is configured, and reads the tokens.
 *
 * @remarks
 * A non-`200` response with an OAuth `error` is `provider_error`, with the code narrowed by
 * {@link readErrorCode} so the provider's own text never reaches the result. Any other non-`200` is
 * `request_failed`. A `200` must be a valid token response. Never throws for any response.
 *
 * @param options - The resolved client options, supplying the endpoint, credentials, and clock.
 * @param form - The grant parameters. The credentials are added to it, so the caller must not reuse it.
 * @returns The frozen token set, or every issue found.
 */
export async function requestTokens(
  options: ResolvedClientOptions,
  form: URLSearchParams,
): Promise<OidcResult<TokenSet>> {
  const headers = await authenticate(options, form);
  const response = await requestJson({
    endpoint: "token",
    url: options.metadata.token_endpoint,
    method: "POST",
    headers,
    form,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
  });
  if (!response.ok) {
    return response;
  }
  const { status, body } = response.value;
  if (status !== HTTP_OK) {
    const error = member(body, "error");
    return typeof error === "string"
      ? fail({ code: "provider_error", params: { endpoint: "token", error: readErrorCode(error) } })
      : requestFailure("token", "status", status);
  }
  const issues = tokenResponseIssues(body);
  return issues.length === 0 ? ok(toTokenSet(body, options.now)) : failAll(issues);
}
