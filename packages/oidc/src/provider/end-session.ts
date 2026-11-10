import { createKeySet, createVerifier } from "@codenhub/jwt";

import { decodeBase64Url } from "../shared/encoding";
import { fail, ok } from "../shared/result";
import type { OidcIssue, OidcResult } from "../shared/types";
import { checkClientRecord } from "./client-record";
import { readFrontChannelParameters } from "./front-channel";
import type { ResolvedOptions } from "./options";
import { redirectResponse } from "./responses";
import type { ClientRecord, EndSession } from "./types";

const MILLISECONDS_PER_SECOND = 1000;

/** What a verified `id_token_hint` tells the provider: the user, and the clients the token was issued to. */
interface Hint {
  readonly subject: string;
  readonly audiences: readonly string[];
  /** The client the token names: its only audience, or `azp` when it has several. */
  readonly clientId: string;
}

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
 * Verifies an `id_token_hint` as an ID token this provider issued: signed by one of its keys, with its issuer and
 * typed `JWT`. It may have expired, as a hint normally has by the time the user signs out. The type keeps a JWT access token (`at+jwt`), signed by the same keys, from passing as a hint. A hint with several
 * audiences and no `azp` among them names no client, so it is ignored rather than trusted for any of them.
 */
async function verifyHint(options: ResolvedOptions, idTokenHint: string | undefined): Promise<Hint | undefined> {
  if (idTokenHint === undefined) {
    return undefined;
  }
  const verifyAt = (now: number): ReturnType<ReturnType<typeof createVerifier>> =>
    createVerifier({
      keys: createKeySet(options.publicKeys),
      issuer: options.issuer,
      type: "JWT",
      requiredClaims: ["sub", "aud", "exp", "iat"],
      now: () => now * MILLISECONDS_PER_SECOND,
    })(idTokenHint);
  let verified = await verifyAt(options.now());
  if (!verified.ok && verified.error.issues.length === 1 && verified.error.issues[0].code === "expired") {
    // Expiry is the hint's only fault, so its signature and every other claim were just verified. It is verified
    // again at the moment it was issued, which is how `@codenhub/jwt` hands over the payload of an expired token.
    const issuedAt = issueTimeOf(idTokenHint);
    verified = issuedAt === undefined ? verified : await verifyAt(issuedAt);
  }
  if (!verified.ok || typeof verified.value.payload.sub !== "string") {
    return undefined;
  }
  const { aud, azp, sub } = verified.value.payload;
  const audiences = typeof aud === "string" ? [aud] : (aud ?? []);
  const clientId =
    audiences.length === 1 ? audiences[0] : typeof azp === "string" && audiences.includes(azp) ? azp : undefined;
  return clientId === undefined ? undefined : { subject: sub, audiences, clientId };
}

/** The `iat` of a token whose signature and claim types `@codenhub/jwt` has already verified. */
function issueTimeOf(token: string): number | undefined {
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(token.split(".")[1] ?? "")));
    const iat = typeof payload === "object" && payload !== null ? (payload as { iat?: unknown }).iat : undefined;
    return typeof iat === "number" ? iat : undefined;
  } catch {
    return undefined;
  }
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
