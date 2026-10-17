import { digestKey } from "../shared/encoding";
import { refuse } from "./diagnostics";
import type { ResolvedOptions } from "./options";
import { revocationResponse, tokenErrorResponse } from "./responses";
import { readClientRequest } from "./token";

/**
 * Answers the revocation endpoint (RFC 7009): an authenticated client revokes an access or refresh token it
 * was issued, and with it the whole grant.
 *
 * @remarks
 * Revoking either kind of token revokes its grant through `revokeGrant`, so the access and refresh tokens
 * issued with it stop working together, as RFC 7009 §2.1 allows. A token that is unknown, expired, or
 * already revoked is answered `200` like a revoked one (§2.2), so the endpoint reveals nothing about it.
 * `token_type_hint` is ignored, as §2.1 permits: the access token table is read first, because reading it
 * changes nothing, and the refresh token is consumed after, which spends it for good.
 *
 * A token issued to another client is refused with `invalid_request` (§2.1). An access token is left alone
 * then. A refresh token was already spent by the lookup, so its grant is revoked anyway: a refresh token
 * in another client's hands has leaked, and the next use of the spent token would revoke the grant as a
 * replay in any case.
 *
 * Never throws for a request. Store rejections propagate.
 *
 * @param options - The resolved provider options.
 * @param request - The request to the revocation endpoint.
 * @returns `200` with no body, or an OAuth error response.
 */
export async function handleRevocation(options: ResolvedOptions, request: Request): Promise<Response> {
  const read = await readClientRequest(options, request);
  if (!read.ok) {
    return read.response;
  }
  const token = read.parameters.get("token");
  const clientId = read.client.clientId;
  if (token === undefined || token === "") {
    return refuse(tokenErrorResponse("invalid_request"), "token_missing", clientId);
  }
  const key = await digestKey(token);
  const otherClient = (): Response =>
    refuse(tokenErrorResponse("invalid_request"), "token_of_another_client", clientId);

  const accessToken = await options.store.findAccessToken(key);
  if (accessToken !== undefined) {
    if (accessToken.clientId !== clientId) {
      return otherClient();
    }
    await options.store.revokeGrant(accessToken.grantId);
    return revocationResponse();
  }

  const consumption = await options.store.consumeRefreshToken(key);
  if (consumption === undefined) {
    return revocationResponse();
  }
  if (consumption.status === "replayed") {
    // A spent refresh token presented again is a replay wherever it arrives.
    await options.store.revokeGrant(consumption.grantId);
    return revocationResponse();
  }
  await options.store.revokeGrant(consumption.record.grantId);
  return consumption.record.clientId === clientId ? revocationResponse() : otherClient();
}
