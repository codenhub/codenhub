import { digestKey } from "../shared/encoding";
import type { ResolvedOptions } from "./options";
import type { AccessTokenRecord } from "./types";

/**
 * The `Authorization` header a bearer token is read from: the `Bearer` scheme in any letter case, one or more spaces
 * (RFC 6750 §2.1: `"Bearer" 1*SP`), then a token of the RFC 6750 §2.1 character set. Anything else is malformed.
 */
const BEARER_AUTHORIZATION = /^Bearer +([A-Za-z0-9\-._~+/]+=*)$/i;

/** Why a request's bearer token found no live access token. */
export type BearerFailure =
  | "access_token_missing"
  | "access_token_malformed"
  | "access_token_unknown"
  | "access_token_expired";

/** Outcome of {@link findBearerAccessToken}: the live record, or why there is none, with the record when one was found. */
export type BearerLookup =
  | { readonly ok: true; readonly record: AccessTokenRecord }
  | {
      readonly ok: false;
      readonly reason: BearerFailure;
      readonly clientId?: string;
    };

/**
 * Finds the live access token a request presents in its `Authorization` header, for every check of a
 * bearer token.
 *
 * @remarks
 * The token travels only in the `Authorization` header. A token in the body or query is not read, so a credential
 * never lands in a URL that a proxy or log would keep. It is looked up by digest in the access-token table only: an
 * ID token or refresh token presented here is never found, which is what stops one kind of token from being used as
 * another.
 *
 * @param options - The resolved provider options.
 * @param request - The request carrying the token.
 * @returns The record, or why there is none. `clientId` comes with `access_token_expired`, from the store's record.
 * Rejects only when the store does.
 */
export async function findBearerAccessToken(options: ResolvedOptions, request: Request): Promise<BearerLookup> {
  const header = request.headers.get("authorization");
  if (header === null) {
    return { ok: false, reason: "access_token_missing" };
  }
  const token = BEARER_AUTHORIZATION.exec(header)?.[1];
  if (token === undefined) {
    return { ok: false, reason: "access_token_malformed" };
  }
  const record = await options.store.findAccessToken(await digestKey(token));
  if (record === undefined) {
    return { ok: false, reason: "access_token_unknown" };
  }
  if (record.expiresAt <= options.now()) {
    return {
      ok: false,
      reason: "access_token_expired",
      clientId: record.clientId,
    };
  }
  return { ok: true, record };
}
