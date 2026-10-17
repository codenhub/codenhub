import { digestKey } from "../shared/encoding";
import type { ResolvedOptions } from "./options";
import { bearerErrorResponse, jsonResponse, methodNotAllowed, preflightResponse } from "./responses";

/**
 * The `Authorization` header this endpoint accepts: the `Bearer` scheme in any letter case, one space, then
 * a token of the RFC 6750 §2.1 character set. Anything else is malformed, including a second space.
 */
const BEARER_AUTHORIZATION = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i;

const USERINFO_METHODS: readonly string[] = ["GET", "POST"];

/**
 * Answers the userinfo endpoint (OpenID Connect Core §5.3): the claims the access token's scopes release.
 *
 * @remarks
 * The token travels only in the `Authorization` header. A token in the body or query is not read, so a
 * credential never lands in a URL that a proxy or log would keep.
 *
 * @param options - Validated provider options.
 * @param request - The incoming request.
 * @returns The userinfo response, or a preflight or method error. Rejects only when the store or the
 * `claims` callback rejects.
 */
export async function handleUserinfo(options: ResolvedOptions, request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return preflightResponse(USERINFO_METHODS);
  }
  if (!USERINFO_METHODS.includes(request.method)) {
    return methodNotAllowed([...USERINFO_METHODS, "OPTIONS"]);
  }
  return answerWithAccessToken(options, request);
}

/** Reads the bearer token, looks up its record, and answers with the released claims. */
async function answerWithAccessToken(options: ResolvedOptions, request: Request): Promise<Response> {
  const header = request.headers.get("authorization");
  if (header === null) {
    return bearerErrorResponse();
  }
  const match = BEARER_AUTHORIZATION.exec(header);
  const token = match?.[1];
  if (token === undefined) {
    return bearerErrorResponse("invalid_request");
  }

  // Looked up by digest in the access-token table only. An ID token or refresh token presented here is
  // never found, which is what stops one kind of token from being used as another.
  const record = await options.store.findAccessToken(await digestKey(token));
  if (record === undefined || record.expiresAt <= options.now()) {
    return bearerErrorResponse("invalid_token");
  }

  const claimNames = claimNamesFor(options, record.scopes);
  const released = await options.claims({
    subject: record.subject,
    clientId: record.clientId,
    scopes: record.scopes,
    claims: claimNames,
  });
  return jsonResponse(releasedClaims(released, claimNames, record.subject), { caching: "no-store" });
}

/** The union of the claim names the granted scopes release, each named once. */
function claimNamesFor(options: ResolvedOptions, scopes: readonly string[]): readonly string[] {
  const names = new Set<string>();
  for (const scope of scopes) {
    for (const name of options.scopeClaims.get(scope) ?? []) {
      names.add(name);
    }
  }
  return [...names];
}

/**
 * Keeps only the claims the scopes release, read as data so a getter on the callback's result never runs,
 * then sets `sub` last so no claim can replace the subject the token was issued to.
 *
 * @throws {TypeError} When the `claims` callback resolves to something that is not an object.
 */
function releasedClaims(
  released: Readonly<Record<string, unknown>>,
  claimNames: readonly string[],
  subject: string,
): Record<string, unknown> {
  if (typeof released !== "object" || released === null) {
    throw new TypeError("claims callback must resolve to an object");
  }
  const entries: [string, unknown][] = [];
  for (const name of claimNames) {
    const value = ownDataValue(released, name);
    if (value !== undefined) {
      entries.push([name, value]);
    }
  }
  entries.push(["sub", subject]);
  // `Object.fromEntries` defines each property rather than assigning it, so a claim named `__proto__` stays
  // an ordinary property.
  return Object.fromEntries(entries);
}

/** The value of an own, enumerable data property, or `undefined` for anything else, without running a getter. */
function ownDataValue(source: object, name: string): unknown {
  if (!Object.hasOwn(source, name)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(source, name);
  if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
    return undefined;
  }
  return descriptor.value;
}
