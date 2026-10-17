import { isRedirectUri } from "../shared/urls";
import type { ClientRecord, GrantType } from "./types";

const AUTH_METHODS = new Set([
  "none",
  "client_secret_basic",
  "client_secret_post",
  "client_secret_jwt",
  "private_key_jwt",
]);

const GRANT_TYPES: ReadonlySet<unknown> = new Set<GrantType>(["authorization_code", "client_credentials"]);
const DEFAULT_GRANT_TYPES: readonly GrantType[] = Object.freeze(["authorization_code"]);

/** A client record that passed {@link checkClientRecord}, with its grants resolved. */
export type CheckedClient = ClientRecord & { readonly grantTypes: readonly GrantType[] };

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
 * @throws {TypeError} When the record is malformed or names another client.
 */
export function checkClientRecord(record: unknown, clientId: string): CheckedClient {
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
    (typeof auth.secretHash !== "string" || auth.secretHash === "")
  ) {
    return invalid("must carry a non-empty auth.secretHash for a client secret method");
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
  // Resolved here, so every endpoint reads the list without repeating the default.
  return { ...(record as unknown as ClientRecord), grantTypes };
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
