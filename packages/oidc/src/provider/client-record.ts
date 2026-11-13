import type { AsymmetricAlgorithm } from "@codenhub/jwt";

import { isHttpsUrl, isRedirectUri } from "../shared/urls";
import { CLIENT_TTL_NAMES, describeTtlRange, isTtlInRange, type ResolvedTtl, SCOPE_TOKEN } from "./options";
import type { ClientRecord, GrantType } from "./types";

/** Every algorithm a signing key may have; a `Record`, so a new `@codenhub/jwt` algorithm fails to compile here. */
const ID_TOKEN_ALGORITHMS: Readonly<Record<AsymmetricAlgorithm, true>> = {
  ES256: true,
  EdDSA: true,
  Ed25519: true,
  RS256: true,
  PS256: true,
};

const AUTH_METHODS = new Set([
  "none",
  "client_secret_basic",
  "client_secret_post",
  "client_secret_jwt",
  "private_key_jwt",
]);

const GRANT_TYPES: ReadonlySet<unknown> = new Set<GrantType>(["authorization_code", "client_credentials"]);
const DEFAULT_GRANT_TYPES: readonly GrantType[] = Object.freeze(["authorization_code"]);

/** A client record that passed {@link checkClientRecord}, with its grants and PKCE requirement resolved. */
export type CheckedClient = ClientRecord & { readonly grantTypes: readonly GrantType[]; readonly requirePkce: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry !== "");

const invalid = (requirement: string): never => {
  throw new TypeError(`OidcStore.findClient: a client record ${requirement}`);
};

/**
 * Checks a client record the store returned for the client it was asked for. The store is the app's own
 * code, so a malformed record is a programmer error and throws rather than failing the request.
 *
 * @param record - What the store returned.
 * @param clientId - The client that was looked up.
 * @param signingKeys - The provider's signing keys, one of which the record's `idTokenSigningAlg` must name.
 * @throws {TypeError} When the record is malformed or names another client.
 */
export function checkClientRecord(
  record: unknown,
  clientId: string,
  signingKeys: readonly { readonly alg: string }[],
): CheckedClient {
  if (!isRecord(record) || record.clientId !== clientId) {
    return invalid("must be an object whose clientId is the one looked up");
  }
  const grantTypes = readGrantTypes(record.grantTypes);
  const signsUsersIn = grantTypes.includes("authorization_code");
  if (
    !isStringArray(record.redirectUris) ||
    (signsUsersIn && record.redirectUris.length === 0) ||
    !record.redirectUris.every(isRedirectUri)
  ) {
    return invalid(
      "must list redirect URIs, at least one for authorization_code, each absolute, of visible ASCII, without fragment or credentials, and not javascript:, data:, vbscript: or file:",
    );
  }
  if (!isStringArray(record.scopes) || (signsUsersIn && !record.scopes.includes("openid"))) {
    return invalid("must list scopes, including openid for authorization_code");
  }
  const { auth } = record;
  if (!isRecord(auth) || typeof auth.method !== "string" || !AUTH_METHODS.has(auth.method)) {
    return invalid("must have an auth.method this provider supports");
  }
  if (
    (auth.method === "client_secret_basic" || auth.method === "client_secret_post") &&
    (!isStringArray(auth.secretHashes) || auth.secretHashes.length === 0)
  ) {
    return invalid("must carry a non-empty auth.secretHashes list of non-empty strings for a client secret method");
  }
  if (auth.method === "client_secret_jwt" && !isRecord(auth.key)) {
    return invalid("must carry auth.key for client_secret_jwt");
  }
  if (auth.method === "private_key_jwt" && (!isRecord(auth.keys) || typeof auth.keys.select !== "function")) {
    return invalid("must carry an auth.keys key set for private_key_jwt");
  }
  if (
    record.postLogoutRedirectUris !== undefined &&
    (!isStringArray(record.postLogoutRedirectUris) || !record.postLogoutRedirectUris.every(isRedirectUri))
  ) {
    return invalid("must list postLogoutRedirectUris, when present, by the rules of redirectUris");
  }
  if (auth.method === "none" && grantTypes.includes("client_credentials")) {
    return invalid("must not allow client_credentials to a client whose auth.method is none");
  }
  checkTtl(record.ttl);
  const { idTokenSigningAlg } = record;
  if (
    idTokenSigningAlg !== undefined &&
    (typeof idTokenSigningAlg !== "string" ||
      !Object.hasOwn(ID_TOKEN_ALGORITHMS, idTokenSigningAlg) ||
      !signingKeys.some((key) => key.alg === idTokenSigningAlg))
  ) {
    return invalid("must name, as idTokenSigningAlg, the algorithm of one of the provider's signing keys");
  }
  const { requirePkce } = record;
  if (requirePkce !== undefined && typeof requirePkce !== "boolean") {
    return invalid("must give requirePkce, when present, as a boolean");
  }
  if (record.idTokenClaims !== undefined && typeof record.idTokenClaims !== "boolean") {
    return invalid("must give idTokenClaims, when present, as a boolean");
  }
  if (requirePkce === false && auth.method === "none") {
    return invalid("must not turn requirePkce off for a client whose auth.method is none");
  }
  checkBackchannelLogout(record.backchannelLogout);
  // Resolved here, so every endpoint reads the list and the flag without repeating the default.
  return { ...(record as unknown as ClientRecord), grantTypes, requirePkce: requirePkce ?? true };
}

/**
 * Checks a client's back-channel logout registration. Its URI is called by the app's server, so it must be `https`
 * (scope.md decision 7), unlike a redirect URI, which a browser follows and a native app may register by custom scheme.
 */
function checkBackchannelLogout(backchannelLogout: unknown): void {
  if (backchannelLogout === undefined) {
    return;
  }
  if (
    !isRecord(backchannelLogout) ||
    Array.isArray(backchannelLogout) ||
    !isHttpsUrl(backchannelLogout.uri) ||
    (backchannelLogout.sessionRequired !== undefined && typeof backchannelLogout.sessionRequired !== "boolean")
  ) {
    invalid(
      "must give backchannelLogout, when present, as an object with a uri that is an absolute https URL of visible ASCII without fragment or credentials, and a boolean sessionRequired when given",
    );
  }
}

/**
 * Checks a client's own lifetimes, each held to the bounds of the provider's option of the same name. Only
 * `undefined` leaves a lifetime to the provider, so an explicit `null` is refused like any other non-integer.
 */
function checkTtl(ttl: unknown): void {
  if (ttl === undefined) {
    return;
  }
  if (!isRecord(ttl) || Array.isArray(ttl)) {
    invalid("must give ttl, when present, as an object");
  }
  const lifetimes = ttl as Record<string, unknown>;
  for (const name of CLIENT_TTL_NAMES) {
    if (lifetimes[name] !== undefined && !isTtlInRange(name, lifetimes[name])) {
      invalid(`must give ttl.${name}, when present, as ${describeTtlRange(name)}`);
    }
  }
}

/**
 * Whether a request may ask `client` for `scope`: it is a scope token (RFC 6749 §3.3) the client's record lists.
 * What the provider's `scopes` option defines does not matter here: a scope the record allows and the option lacks
 * is accepted and releases no claims, so an app-defined scope can live only in the database.
 */
export const isScopeOfClient = (client: Pick<ClientRecord, "scopes">, scope: string): boolean =>
  SCOPE_TOKEN.test(scope) && client.scopes.includes(scope);

/** The lifetimes for tokens of `client`: its own where its record sets them, the provider's otherwise. */
export function lifetimesOf(provider: ResolvedTtl, client: ClientRecord): ResolvedTtl {
  const own = client.ttl;
  return own === undefined
    ? provider
    : {
        ...provider,
        ...Object.fromEntries(
          CLIENT_TTL_NAMES.filter((name) => own[name] !== undefined).map((name) => [name, own[name]]),
        ),
      };
}

/** The client's grants, or the default when the record has none. */
function readGrantTypes(grantTypes: unknown): readonly GrantType[] {
  if (grantTypes === undefined) {
    return DEFAULT_GRANT_TYPES;
  }
  if (
    !Array.isArray(grantTypes) ||
    grantTypes.length === 0 ||
    !grantTypes.every((grantType) => GRANT_TYPES.has(grantType)) ||
    new Set(grantTypes).size !== grantTypes.length
  ) {
    return invalid("must list grantTypes as authorization_code or client_credentials, at least one, without repeats");
  }
  return grantTypes as readonly GrantType[];
}
