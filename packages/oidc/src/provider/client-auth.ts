import { type KeySet, createKeySet, createVerifier } from "@codenhub/jwt";

import { checkClientRecord } from "./client-record";
import type { ResolvedOptions } from "./options";
import { tokenErrorResponse } from "./responses";
import { verifyClientSecret } from "./secrets";
import type { ClientRecord } from "./types";

/** The client assertion type of RFC 7523 §2.2, the only one this provider accepts. */
const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BITS_PER_BASE64_CHARACTER = 6;
const BITS_PER_BYTE = 8;
const BYTE_MASK = 0xff;
const BUFFER_MASK = 0xffff;

/** RFC 6749 §5.2: a `401` for Basic credentials must say how to authenticate. */
const BASIC_CHALLENGE: Readonly<Record<string, string>> = { "www-authenticate": 'Basic realm="token"' };

/** Clock tolerance for client assertions, in seconds: client clocks drift, and a minute covers ordinary skew. */
const ASSERTION_CLOCK_TOLERANCE_SECONDS = 60;

/**
 * Longest lifetime an assertion may claim, in seconds, measured from the provider's now plus the clock tolerance.
 * RFC 7523 §3 lets the server refuse an unreasonably distant `exp`; replay within the lifetime is accepted by
 * design (scope.md decision 15), so this bounds that window.
 */
const MAX_ASSERTION_LIFETIME_SECONDS = 300;

/** Outcome of {@link authenticateClient}: the authenticated client, or the response to send. */
export type ClientAuthResult =
  | { readonly ok: true; readonly client: ClientRecord }
  | { readonly ok: false; readonly response: Response };

/**
 * The credentials a request presented, before any of them is checked. A `basic` request is one whose
 * secret came from the `authorization` header, which decides the challenge on failure.
 */
type Presented =
  | { readonly method: "basic"; readonly clientId: string; readonly secret: string }
  | { readonly method: "client_secret_post"; readonly clientId: string; readonly secret: string }
  | { readonly method: "assertion"; readonly clientId: string; readonly assertion: string }
  | { readonly method: "none"; readonly clientId: string };

type Extracted =
  | { readonly ok: true; readonly presented: Presented }
  | { readonly ok: false; readonly response: Response };

const invalidRequest = (): Extracted => ({ ok: false, response: tokenErrorResponse("invalid_request") });

/** A failed client check. The Basic challenge is added only when Basic was presented, as RFC 6749 §5.2 asks. */
const rejectClient = (presented: Presented): ClientAuthResult => ({
  ok: false,
  response: tokenErrorResponse("invalid_client", presented.method === "basic" ? BASIC_CHALLENGE : undefined),
});

/**
 * Authenticates the client of a token request (RFC 6749 §2.3), by Basic, `client_secret_post`, a JWT client
 * assertion (RFC 7523), or no credentials for a public client.
 *
 * @remarks
 * Never throws for anything the request carries: every failure is an OAuth error response. A malformed
 * client record from the store still throws, because that is the app's own bug.
 *
 * @param options - The resolved provider options.
 * @param request - The token request; only its `authorization` header is read.
 * @param parameters - The parsed form body.
 * @returns The authenticated client, or the error response to return.
 */
export async function authenticateClient(
  options: ResolvedOptions,
  request: Request,
  parameters: ReadonlyMap<string, string>,
): Promise<ClientAuthResult> {
  const extracted = extractCredentials(request, parameters);
  if (!extracted.ok) {
    return extracted;
  }
  const { presented } = extracted;
  const record = await options.store.findClient(presented.clientId);
  if (record === undefined) {
    return rejectClient(presented);
  }
  const client = checkClientRecord(record, presented.clientId);
  return (await proves(options, client, presented)) ? { ok: true, client } : rejectClient(presented);
}

/**
 * Reads which credentials the request presents and their identifiers, without checking any of them. More
 * than one method is refused, so a request cannot choose between two sets of credentials.
 */
function extractCredentials(request: Request, parameters: ReadonlyMap<string, string>): Extracted {
  const authorization = request.headers.get("authorization");
  const secret = parameters.get("client_secret");
  const assertion = parameters.get("client_assertion");
  const presentedCount = [authorization, secret, assertion].filter(
    (value) => value !== null && value !== undefined,
  ).length;
  if (presentedCount > 1) {
    return invalidRequest();
  }
  if (authorization !== null) {
    return extractBasic(authorization, parameters);
  }
  if (secret !== undefined) {
    const clientId = parameters.get("client_id");
    return clientId === undefined
      ? invalidRequest()
      : { ok: true, presented: { method: "client_secret_post", clientId, secret } };
  }
  if (assertion !== undefined) {
    return extractAssertion(assertion, parameters);
  }
  const clientId = parameters.get("client_id");
  return clientId === undefined ? invalidRequest() : { ok: true, presented: { method: "none", clientId } };
}

/**
 * Reads a Basic `authorization` header (RFC 6749 §2.3.1). Any other scheme, an empty header, or malformed Basic
 * credentials are `invalid_client` with the Basic challenge, since the client attempted header authentication
 * (RFC 6749 §5.2).
 */
function extractBasic(authorization: string, parameters: ReadonlyMap<string, string>): Extracted {
  const invalidClient: Extracted = { ok: false, response: tokenErrorResponse("invalid_client", BASIC_CHALLENGE) };
  // The scheme is case-insensitive and followed by exactly one space; anything else is another scheme.
  const match = /^basic (.*)$/i.exec(authorization);
  if (match === null) {
    return invalidClient;
  }
  const bytes = decodeBase64(match[1] ?? "");
  const text = bytes === undefined ? undefined : decodeUtf8(bytes);
  // Split at the first colon only: the id cannot contain one, but the secret may.
  const colon = text?.indexOf(":") ?? -1;
  if (text === undefined || colon < 0) {
    return invalidClient;
  }
  const clientId = formDecode(text.slice(0, colon));
  const secret = formDecode(text.slice(colon + 1));
  if (clientId === undefined || secret === undefined) {
    return invalidClient;
  }
  // A body client_id must agree with the header's, so the two cannot name different clients.
  const bodyClientId = parameters.get("client_id");
  if (bodyClientId !== undefined && bodyClientId !== clientId) {
    return invalidRequest();
  }
  return { ok: true, presented: { method: "basic", clientId, secret } };
}

/** Reads a JWT client assertion. Its `client_id` is required, since the payload is not decoded before it is verified. */
function extractAssertion(assertion: string, parameters: ReadonlyMap<string, string>): Extracted {
  const clientId = parameters.get("client_id");
  if (parameters.get("client_assertion_type") !== CLIENT_ASSERTION_TYPE || clientId === undefined) {
    return invalidRequest();
  }
  return { ok: true, presented: { method: "assertion", clientId, assertion } };
}

/**
 * Tests whether the presented credentials prove the client's registered method. A method mismatch is a
 * failure of the same kind as a wrong secret, so a caller cannot tell the two apart.
 */
async function proves(options: ResolvedOptions, client: ClientRecord, presented: Presented): Promise<boolean> {
  const { auth } = client;
  switch (auth.method) {
    case "none":
      return presented.method === "none";
    case "client_secret_basic":
      return presented.method === "basic" && (await verifyClientSecret(presented.secret, auth.secretHash));
    case "client_secret_post":
      return presented.method === "client_secret_post" && (await verifyClientSecret(presented.secret, auth.secretHash));
    case "client_secret_jwt":
      return (
        presented.method === "assertion" &&
        (await verifyAssertion(options, presented.clientId, presented.assertion, createKeySet([auth.key])))
      );
    case "private_key_jwt":
      return (
        presented.method === "assertion" &&
        (await verifyAssertion(options, presented.clientId, presented.assertion, auth.keys))
      );
  }
}

/**
 * Verifies a client assertion (RFC 7523 §3): signed by the client's key, issued by and about the client,
 * addressed to this provider or its token endpoint, unexpired, with a `jti`, and with a lifetime no longer than
 * {@link MAX_ASSERTION_LIFETIME_SECONDS}.
 */
async function verifyAssertion(
  options: ResolvedOptions,
  clientId: string,
  assertion: string,
  keys: KeySet,
): Promise<boolean> {
  // The verifier is built per request because it is cheap, and it reads the clock from the same source as the rest.
  // `jti` is required as RFC 7523 §3 and OpenID Connect Core §9 ask. Replay within the capped lifetime is accepted
  // by design (scope.md decision 15).
  const verify = createVerifier({
    keys,
    issuer: clientId,
    audience: [options.issuer, options.endpoints.token],
    requiredClaims: ["sub", "exp", "jti"],
    clockTolerance: ASSERTION_CLOCK_TOLERANCE_SECONDS,
    now: () => options.now() * 1000,
  });
  const result = await verify(assertion);
  if (!result.ok || result.value.payload.sub !== clientId) {
    return false;
  }
  const exp = result.value.payload.exp ?? Number.POSITIVE_INFINITY;
  return exp <= options.now() + MAX_ASSERTION_LIFETIME_SECONDS + ASSERTION_CLOCK_TOLERANCE_SECONDS;
}

/** Decodes strict standard base64 (RFC 4648 §4) with mandatory padding. Anything else is `undefined`. */
function decodeBase64(text: string): Uint8Array | undefined {
  if (!BASE64_PATTERN.test(text)) {
    return undefined;
  }
  const unpadded = text.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of unpadded) {
    buffer = ((buffer << BITS_PER_BASE64_CHARACTER) | BASE64_ALPHABET.indexOf(character)) & BUFFER_MASK;
    bits += BITS_PER_BASE64_CHARACTER;
    if (bits >= BITS_PER_BYTE) {
      bits -= BITS_PER_BYTE;
      bytes.push((buffer >> bits) & BYTE_MASK);
    }
  }
  return new Uint8Array(bytes);
}

/** Decodes UTF-8 strictly, so invalid bytes fail rather than becoming U+FFFD in a credential. */
function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** Form-urldecodes one half of a Basic credential (RFC 6749 §2.3.1): `+` is a space, then percent-decoding. */
function formDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return undefined;
  }
}
