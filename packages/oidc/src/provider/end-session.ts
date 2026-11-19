import { fail, ok } from "../shared/result";
import type { OidcIssue, OidcResult } from "../shared/types";
import { findClientRecord } from "./client-record";
import { readFrontChannelParameters } from "./front-channel";
import { verifyIdTokenHint } from "./id-token-hint";
import type { ResolvedOptions } from "./options";
import { redirectResponse } from "./responses";
import type { ClientRecord, EndSession } from "./types";

/**
 * Validates an RP-initiated logout request (RP-Initiated Logout 1.0 §2, §3), for the app to end its own session.
 *
 * @remarks
 * Nothing in a failed request is trusted with a redirect, so every failure is for the app to render. An
 * `id_token_hint` that does not verify is ignored rather than refused, so it names no user and no client. An
 * expired one that is otherwise valid still verifies (RP-Initiated Logout 1.0 §2).
 */
export async function endSession(options: ResolvedOptions, request: Request): Promise<OidcResult<EndSession>> {
  const read = await readFrontChannelParameters(request, "endSession");
  if (!read.ok) {
    return fail(
      read.reason === undefined
        ? { code: "invalid_request" }
        : { code: "invalid_request", params: { reason: read.reason } },
    );
  }
  const { parameters } = read;
  const hint = await verifyIdTokenHint(options, parameters.get("id_token_hint"));
  const requestedClientId = parameters.get("client_id");
  // §2: with both present, the client must be one the ID token was issued to.
  if (hint !== undefined && requestedClientId !== undefined && !hint.audiences.includes(requestedClientId)) {
    return fail(issueAt("invalid_request", "id_token_hint"));
  }
  const clientId = requestedClientId ?? hint?.clientId;
  const client = clientId === undefined ? undefined : await findClient(options, clientId);
  if (requestedClientId !== undefined && client === undefined) {
    return fail({ code: "unknown_client" });
  }
  const redirect = buildRedirect(client, parameters);
  if (redirect === "invalid") {
    return fail(issueAt("invalid_redirect_uri", "post_logout_redirect_uri"));
  }
  const uiLocales = parameters
    .get("ui_locales")
    ?.split(" ")
    .filter((locale) => locale !== "");
  return ok({
    ...(client === undefined ? {} : { clientId: client.clientId }),
    ...(hint === undefined ? {} : { subject: hint.subject }),
    ...optionalMember("sessionId", hint?.sessionId),
    ...optionalMember("logoutHint", parameters.get("logout_hint")),
    ...optionalMember("uiLocales", uiLocales !== undefined && uiLocales.length > 0 ? uiLocales : undefined),
    redirect,
  });
}

const issueAt = (code: OidcIssue["code"], parameter: string): OidcIssue => ({ code, path: [parameter] });

const optionalMember = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

const findClient = (options: ResolvedOptions, clientId: string): Promise<ClientRecord | undefined> =>
  findClientRecord(options.store, clientId, options.publicKeys);

/**
 * The redirect after logout, or `null` when the request names no `post_logout_redirect_uri`. The URI must be one
 * the client registered, byte for byte, which needs a known client: otherwise `invalid`, since redirecting to an
 * unverified URI would make the endpoint an open redirect.
 */
function buildRedirect(
  client: ClientRecord | undefined,
  parameters: ReadonlyMap<string, string>,
): Response | null | "invalid" {
  const uri = parameters.get("post_logout_redirect_uri");
  if (uri === undefined) {
    return null;
  }
  if (client === undefined || !(client.postLogoutRedirectUris ?? []).includes(uri)) {
    return "invalid";
  }
  return redirectResponse(uri, { state: parameters.get("state") });
}
