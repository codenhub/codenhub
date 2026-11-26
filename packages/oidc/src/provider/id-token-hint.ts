import { createKeySet, createVerifier } from "@codenhub/jwt";

import { MAX_ID_TOKEN_LENGTH } from "../shared/limits";
import type { ResolvedOptions } from "./options";

const MILLISECONDS_PER_SECOND = 1000;

/** What a verified `id_token_hint` tells the provider: the user, their session, and the clients it was issued to. */
export interface IdTokenHint {
  readonly subject: string;
  /** The token's `sid`, when it has one: the app's session the sign-in belonged to (scope.md decision 47). */
  readonly sessionId?: string;
  readonly audiences: readonly string[];
  /** The client the token names: its only audience, or `azp` when it has several. */
  readonly clientId: string;
}

/**
 * Verifies an `id_token_hint` as an ID token this provider issued: signed by one of its published keys, a signing key
 * or a verification key, with its issuer and typed `JWT`, or `undefined` when it is not one.
 *
 * @remarks
 * It may have expired, as a hint normally has by the time it is sent back (RP-Initiated Logout 1.0 §2, OpenID
 * Connect Core §3.1.2.1), so `@codenhub/jwt` accepts one that is expired when every other check passes (scope.md
 * decision 45). The type keeps a JWT access token (`at+jwt`) and a logout token
 * (`logout+jwt`), signed by the same keys, from passing as a hint. A hint with several audiences and no `azp` among
 * them names no client, so it is ignored rather than trusted for any of them.
 */
export async function verifyIdTokenHint(
  options: ResolvedOptions,
  idTokenHint: string | undefined,
): Promise<IdTokenHint | undefined> {
  if (idTokenHint === undefined) {
    return undefined;
  }
  const verified = await createVerifier({
    keys: createKeySet(options.publishedKeys),
    issuer: options.issuer,
    // The hint names its clients in `aud`, which the code below reads: any audience is accepted here.
    audience: false,
    type: "JWT",
    // An expired hint whose other checks pass is still a hint (decision 45).
    allowExpired: true,
    // As long as the ID tokens a client of this package accepts; the default of @codenhub/jwt is 8192.
    maxLength: MAX_ID_TOKEN_LENGTH,
    requiredClaims: ["sub", "aud", "exp", "iat"],
    now: () => options.now() * MILLISECONDS_PER_SECOND,
  })(idTokenHint);
  if (!verified.ok || typeof verified.value.payload.sub !== "string") {
    return undefined;
  }
  const { aud, azp, sub, sid, exp, iat } = verified.value.payload;
  // allowExpired accepts any `exp` in the past; one before `iat` was never valid at all (decision 45).
  if (exp === undefined || iat === undefined || exp < iat) {
    return undefined;
  }
  const audiences = typeof aud === "string" ? [aud] : (aud ?? []);
  const clientId =
    audiences.length === 1 ? audiences[0] : typeof azp === "string" && audiences.includes(azp) ? azp : undefined;
  if (clientId === undefined) {
    return undefined;
  }
  return typeof sid === "string" && sid !== ""
    ? { subject: sub, sessionId: sid, audiences, clientId }
    : { subject: sub, audiences, clientId };
}
