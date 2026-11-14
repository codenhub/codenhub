import type { ResolvedOptions } from "./options";

/**
 * The claims the granted scopes release about a user, from the app's `claims` callback: only the names those scopes
 * release, and `sub`, which is always the subject. A scope the provider does not define releases none. Userinfo
 * answers with this, and an ID token for a client with `idTokenClaims` carries it.
 *
 * @param options - Validated provider options.
 * @param grant - Who the claims are about, for which client and scopes.
 * @returns The released claims, with `sub` set.
 * @throws {TypeError} When the callback resolves to something that is not an object. Its own errors propagate.
 */
export async function releaseClaims(
  options: ResolvedOptions,
  grant: { readonly subject: string; readonly clientId: string; readonly scopes: readonly string[] },
): Promise<Record<string, unknown>> {
  const claimNames = claimNamesFor(options, grant.scopes);
  const released = await options.claims({
    subject: grant.subject,
    clientId: grant.clientId,
    scopes: grant.scopes,
    claims: claimNames,
  });
  return releasedClaims(released, claimNames, grant.subject);
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
