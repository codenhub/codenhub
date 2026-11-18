import { createKeySet, createVerifier } from "@codenhub/jwt";

import { decodeBase64Url } from "../shared/encoding";
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
 * Verifies an `id_token_hint` as an ID token this provider issued: signed by one of its keys, with its issuer and
 * typed `JWT`, or `undefined` when it is not one.
 *
 * @remarks
 * It may have expired, as a hint normally has by the time it is sent back (RP-Initiated Logout 1.0 §2, OpenID
 * Connect Core §3.1.2.1): when `@codenhub/jwt` reports expiry as its only fault, it is verified again at the moment it
 * was issued (scope.md decision 45). The type keeps a JWT access token (`at+jwt`) and a logout token
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
  const verifyAt = (now: number): ReturnType<ReturnType<typeof createVerifier>> =>
    createVerifier({
      keys: createKeySet(options.publicKeys),
      issuer: options.issuer,
      type: "JWT",
      // As long as the ID tokens a client of this package accepts; the default of @codenhub/jwt is 8192.
      maxLength: MAX_ID_TOKEN_LENGTH,
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
  const { aud, azp, sub, sid } = verified.value.payload;
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
