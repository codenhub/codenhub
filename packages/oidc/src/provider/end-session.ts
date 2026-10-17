import { createKeySet, createVerifier } from "@codenhub/jwt";

import { fail, ok } from "../shared/result";
import type { OidcIssue, OidcResult } from "../shared/types";
import { checkClientRecord } from "./client-record";
import { readFrontChannelParameters } from "./front-channel";
import type { ResolvedOptions } from "./options";
import { redirectResponse } from "./responses";
import type { ClientRecord, EndSession } from "./types";

/** What a verified `id_token_hint` tells the provider: the user, and the clients the token was issued to. */
interface Hint {
  readonly subject: string;
  readonly audiences: readonly string[];
  /** The client the token names: its only audience, or `azp` when it has several. */
  readonly clientId: string | undefined;
}

/**
 * Validates an RP-initiated logout request (RP-Initiated Logout 1.0 §2, §3), for the app to end its own session.
 *
 * @remarks
 * Nothing in a failed request is trusted with a redirect, so every failure is for the app to render. An
 * `id_token_hint` that does not verify, as an expired one does not, is ignored rather than refused, so it names no
 * user; the redirect does not depend on it, since `post_logout_redirect_uri` is matched against the client's
 * registration.
 */
export async function endSession(options: ResolvedOptions, request: Request): Promise<OidcResult<EndSession>> {
  const read = await readFrontChannelParameters(request);
  if (!read.ok) {
    return fail(
      read.reason === undefined
        ? { code: "invalid_request" }
        : { code: "invalid_request", params: { reason: read.reason } },
    );
  }
  const { parameters } = read;
  const hint = await verifyHint(options, parameters.get("id_token_hint"));
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
    ...optionalMember("logoutHint", parameters.get("logout_hint")),
    ...optionalMember("uiLocales", uiLocales !== undefined && uiLocales.length > 0 ? uiLocales : undefined),
    redirect,
  });
}

const issueAt = (code: OidcIssue["code"], parameter: string): OidcIssue => ({ code, path: [parameter] });

const optionalMember = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

/**
 * Verifies an `id_token_hint` as an ID token this provider issued: signed by one of its keys, with its issuer, and
 * unexpired. `@codenhub/jwt` returns no payload for a token that fails, so an expired hint names no one.
 */
async function verifyHint(options: ResolvedOptions, idTokenHint: string | undefined): Promise<Hint | undefined> {
  if (idTokenHint === undefined) {
    return undefined;
  }
  const verify = createVerifier({
    keys: createKeySet(options.publicKeys),
    issuer: options.issuer,
    requiredClaims: ["sub", "aud"],
    now: () => options.now() * 1000,
  });
  const verified = await verify(idTokenHint);
  if (!verified.ok || typeof verified.value.payload.sub !== "string") {
    return undefined;
  }
  const { aud, azp, sub } = verified.value.payload;
  const audiences = typeof aud === "string" ? [aud] : (aud ?? []);
  const clientId =
    audiences.length === 1 ? audiences[0] : typeof azp === "string" && audiences.includes(azp) ? azp : undefined;
  return { subject: sub, audiences, clientId };
}

async function findClient(options: ResolvedOptions, clientId: string): Promise<ClientRecord | undefined> {
  const record = await options.store.findClient(clientId);
  return record === undefined ? undefined : checkClientRecord(record, clientId);
}

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
