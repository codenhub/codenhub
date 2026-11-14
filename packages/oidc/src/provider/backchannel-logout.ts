import { sign } from "@codenhub/jwt";

import { randomToken } from "../shared/encoding";
import { checkClientRecord } from "./client-record";
import { type ResolvedOptions, selectIdTokenKey } from "./options";

/** The event a logout token names (OpenID Connect Back-Channel Logout 1.0 §2.4). Its value is always `{}`. */
const BACKCHANNEL_LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

/**
 * How long a logout token lives, in seconds. The client should act on it as soon as it arrives, and a short life
 * bounds the replay of one that was captured (§2.6 asks the client to refuse a `jti` it has seen).
 */
const LOGOUT_TOKEN_LIFETIME_SECONDS = 120;

const FORM_MEDIA_TYPE = "application/x-www-form-urlencoded";

/** What the app says about the session that ended. At least one of `subject` and `sessionId` is a string. */
interface Target {
  readonly subject?: string;
  readonly sessionId?: string;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value !== "";

const invalid = (requirement: string): never => {
  throw new TypeError(`backchannelLogout: ${requirement}`);
};

/** Reads the request, which comes from the app's own code, so a malformed one is a programmer error. */
function readRequest(request: unknown): { readonly clientId: string } & Target {
  if (typeof request !== "object" || request === null) {
    return invalid("the request must be an object");
  }
  const { clientId, subject, sessionId } = request as Record<string, unknown>;
  if (!isNonEmptyString(clientId)) {
    return invalid("clientId must be a non-empty string");
  }
  if (
    (subject !== undefined && !isNonEmptyString(subject)) ||
    (sessionId !== undefined && !isNonEmptyString(sessionId))
  ) {
    return invalid("subject and sessionId, when given, must be non-empty strings");
  }
  if (subject === undefined && sessionId === undefined) {
    return invalid("the request must give a subject, a sessionId, or both");
  }
  return {
    clientId,
    ...(subject === undefined ? {} : { subject }),
    ...(sessionId === undefined ? {} : { sessionId }),
  };
}

/**
 * Builds the back-channel logout request for one client (OpenID Connect Back-Channel Logout 1.0 §2.5), for the app
 * to send. The provider keeps no sessions and makes no outbound request, so it neither decides who is signed in nor
 * calls the client.
 *
 * @remarks
 * The token is signed like the client's ID tokens, with `typ: "logout+jwt"`, so a verifier of ID tokens, which
 * requires `JWT`, refuses it (invariant 6). It never carries a `nonce`, which §2.4 forbids.
 */
export async function backchannelLogout(options: ResolvedOptions, request: unknown): Promise<Request | null> {
  const { clientId, subject, sessionId } = readRequest(request);
  const record = await options.store.findClient(clientId);
  if (record === undefined) {
    return null;
  }
  const client = checkClientRecord(record, clientId, options.publicKeys);
  const registration = client.backchannelLogout;
  if (registration === undefined) {
    return null;
  }
  if (registration.sessionRequired === true && sessionId === undefined) {
    return invalid("this client requires a sessionId");
  }
  const { privateKey } = selectIdTokenKey(options, client);
  const issuedAt = options.now();
  const logoutToken = await sign({
    payload: {
      iss: options.issuer,
      aud: clientId,
      iat: issuedAt,
      exp: issuedAt + LOGOUT_TOKEN_LIFETIME_SECONDS,
      jti: randomToken(),
      events: { [BACKCHANNEL_LOGOUT_EVENT]: {} },
      ...(subject === undefined ? {} : { sub: subject }),
      ...(sessionId === undefined ? {} : { sid: sessionId }),
    },
    key: privateKey,
    header: { typ: "logout+jwt" },
  });
  return new Request(registration.uri, {
    method: "POST",
    headers: { "content-type": FORM_MEDIA_TYPE },
    body: new URLSearchParams({ logout_token: logoutToken }).toString(),
    // A redirect would carry the token somewhere the client did not register.
    redirect: "manual",
  });
}
