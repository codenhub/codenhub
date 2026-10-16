import { isRedirectUri } from "../shared/urls";
import type { ClientRecord } from "./types";

const AUTH_METHODS = new Set([
  "none",
  "client_secret_basic",
  "client_secret_post",
  "client_secret_jwt",
  "private_key_jwt",
]);

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
export function checkClientRecord(record: unknown, clientId: string): ClientRecord {
  if (!isRecord(record) || record.clientId !== clientId) {
    return invalid("must be an object whose clientId is the one looked up");
  }
  if (
    !isStringArray(record.redirectUris) ||
    record.redirectUris.length === 0 ||
    !record.redirectUris.every(isRedirectUri)
  ) {
    return invalid("must list at least one redirect URI, each absolute, without fragment or credentials");
  }
  if (!isStringArray(record.scopes) || !record.scopes.includes("openid")) {
    return invalid("must list scopes including openid");
  }
  const { auth } = record;
  if (!isRecord(auth) || typeof auth.method !== "string" || !AUTH_METHODS.has(auth.method)) {
    return invalid("must have an auth.method this provider supports");
  }
  if (
    (auth.method === "client_secret_basic" || auth.method === "client_secret_post") &&
    typeof auth.secretHash !== "string"
  ) {
    return invalid("must carry auth.secretHash for a client secret method");
  }
  if (auth.method === "client_secret_jwt" && !isRecord(auth.key)) {
    return invalid("must carry auth.key for client_secret_jwt");
  }
  if (auth.method === "private_key_jwt" && (!isRecord(auth.keys) || typeof auth.keys.select !== "function")) {
    return invalid("must carry an auth.keys key set for private_key_jwt");
  }
  return record as unknown as ClientRecord;
}
