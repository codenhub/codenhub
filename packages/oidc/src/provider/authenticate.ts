import { failWith, ok } from "../shared/result";
import type { OidcResult } from "../shared/types";
import { findBearerAccessToken } from "./bearer";
import { type ResolvedOptions, SCOPE_TOKEN } from "./options";
import { resourceChallengeResponse } from "./responses";
import type {
  AccessTokenRecord,
  AuthenticateOptions,
  AuthenticationFailure,
  AuthenticationFailureReason,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** The requirements, checked: the scopes each once, in the order given. */
interface Requirements {
  readonly scopes: readonly string[];
  readonly audience: string | undefined;
}

/**
 * Checks the bearer token of a request to the app's own API: the `Authorization` header, a live access token, then
 * the audience and scopes the API requires.
 *
 * @remarks
 * Never throws for a request, and never reports to `onDiagnostic`: the failure carries its reason for the app's
 * logs, and a ready RFC 6750 §3 response. The audience is checked before the scopes, so a token meant for another
 * API is refused as invalid rather than told which scopes it lacks.
 *
 * @param options - The resolved provider options.
 * @param request - The request to the API.
 * @param requirements - The scopes the token must carry, and the audience it must be for.
 * @returns The token's record, or why it does not authenticate. Rejects when the store does.
 * @throws {TypeError} When `requirements` is malformed, before the store is read.
 */
export async function authenticate(
  options: ResolvedOptions,
  request: Request,
  requirements: unknown,
): Promise<OidcResult<AccessTokenRecord, AuthenticationFailure>> {
  const required = readRequirements(requirements);
  const lookup = await findBearerAccessToken(options, request);
  if (!lookup.ok) {
    return refusal(lookup.reason, lookup.clientId);
  }
  const { record } = lookup;
  if (required.audience !== undefined && record.audience?.includes(required.audience) !== true) {
    return refusal("access_token_audience_mismatch", record.clientId);
  }
  if (!required.scopes.every((scope) => record.scopes.includes(scope))) {
    return refusal("access_token_scope_insufficient", record.clientId, required.scopes);
  }
  return ok(copyRecord(record));
}

/**
 * Reads what the API requires, throwing `TypeError` for a value of the wrong shape. A scope must be a scope token
 * (RFC 6749 §3.3), so it can go in the challenge's `scope` attribute unquoted and unescaped.
 */
function readRequirements(requirements: unknown): Requirements {
  if (requirements === undefined) {
    return { scopes: [], audience: undefined };
  }
  if (!isRecord(requirements) || Array.isArray(requirements)) {
    throw new TypeError("authenticate: options must be an object");
  }
  const { scopes, audience } = requirements as AuthenticateOptions;
  if (
    scopes !== undefined &&
    (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === "string" && SCOPE_TOKEN.test(scope)))
  ) {
    throw new TypeError("authenticate: options.scopes must be an array of scope tokens");
  }
  if (audience !== undefined && (typeof audience !== "string" || audience === "")) {
    throw new TypeError("authenticate: options.audience must be a non-empty string");
  }
  return { scopes: [...new Set(scopes ?? [])], audience };
}

/**
 * The failure for `reason`, with the response RFC 6750 §3 gives it: no error code when the request carried no
 * token (§3.1), `400 invalid_request` for a malformed header, `403 insufficient_scope` naming the scopes the API
 * requires, and `401 invalid_token` for every other token, whatever is wrong with it.
 */
function refusal(
  reason: AuthenticationFailureReason,
  clientId: string | undefined,
  scopes: readonly string[] = [],
): OidcResult<AccessTokenRecord, AuthenticationFailure> {
  const code = issueCodeOf(reason);
  const response =
    reason === "access_token_missing"
      ? resourceChallengeResponse()
      : resourceChallengeResponse(code, code === "insufficient_scope" ? scopes : undefined);
  return failWith<AuthenticationFailure>({
    issues: [{ code }],
    response,
    reason,
    ...(clientId === undefined ? {} : { clientId }),
  });
}

function issueCodeOf(reason: AuthenticationFailureReason): "invalid_request" | "invalid_token" | "insufficient_scope" {
  switch (reason) {
    case "access_token_malformed":
      return "invalid_request";
    case "access_token_scope_insufficient":
      return "insufficient_scope";
    default:
      return "invalid_token";
  }
}

/**
 * A copy of the record with only the fields the contract defines, so a store that returns more, or the app that
 * receives the frozen result, cannot change what the next lookup sees.
 */
function copyRecord(record: AccessTokenRecord): AccessTokenRecord {
  return {
    grantId: record.grantId,
    clientId: record.clientId,
    subject: record.subject,
    scopes: [...record.scopes],
    ...(record.sessionId === undefined ? {} : { sessionId: record.sessionId }),
    ...(record.audience === undefined ? {} : { audience: [...record.audience] }),
    expiresAt: record.expiresAt,
  };
}
