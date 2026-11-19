import type { AccessTokenRecord, CodeRecord, InteractionRecord, RefreshTokenRecord } from "./types";

/** The keys of `TRecord` that may be left out. */
type OptionalKeys<TRecord> = { [K in keyof TRecord]-?: object extends Pick<TRecord, K> ? K : never }[keyof TRecord];

/** Each optional field of `TRecord`, named once: a `Record`, so a new optional field fails to compile here. */
type OptionalFields<TRecord> = Readonly<Record<OptionalKeys<TRecord>, true>>;

/*
 * The optional fields of each record the provider reads back from the store. A SQL adapter that maps a column to a
 * field returns `NULL` for a value that was never set, so the provider reads `null` in one of these as absent, and
 * never puts a `null` claim in a token or a `null` parameter in a redirect. A required field is left alone: reading
 * a `null` `expiresAt` as absent would make an expiry check pass.
 */
const INTERACTION_OPTIONAL: OptionalFields<InteractionRecord> = {
  state: true,
  nonce: true,
  codeChallenge: true,
  maxAge: true,
  loginHint: true,
  uiLocales: true,
  acrValues: true,
  claimsLocales: true,
  display: true,
  resources: true,
  responseMode: true,
  extensions: true,
};

const CODE_OPTIONAL: OptionalFields<CodeRecord> = {
  codeChallenge: true,
  nonce: true,
  amr: true,
  acr: true,
  sessionId: true,
  resources: true,
};

const ACCESS_TOKEN_OPTIONAL: OptionalFields<AccessTokenRecord> = {
  grantType: true,
  authTime: true,
  amr: true,
  acr: true,
  sessionId: true,
  audience: true,
};

const REFRESH_TOKEN_OPTIONAL: OptionalFields<RefreshTokenRecord> = {
  amr: true,
  acr: true,
  sessionId: true,
  resources: true,
  issuedAt: true,
};

/** The optional fields of each record the store keeps, for the conformance cases. */
export const OPTIONAL_FIELDS = Object.freeze({
  interaction: Object.freeze(Object.keys(INTERACTION_OPTIONAL)),
  code: Object.freeze(Object.keys(CODE_OPTIONAL)),
  accessToken: Object.freeze(Object.keys(ACCESS_TOKEN_OPTIONAL)),
  refreshToken: Object.freeze(Object.keys(REFRESH_TOKEN_OPTIONAL)),
});

/** A shallow copy of `record` without each `optional` field whose value is `null`; the record itself when none is. */
function withoutNulls<TRecord extends object>(record: TRecord, optional: OptionalFields<TRecord>): TRecord {
  const isNullOptional = ([name, value]: [string, unknown]): boolean => value === null && Object.hasOwn(optional, name);
  const entries = Object.entries(record);
  return entries.some(isNullOptional)
    ? (Object.fromEntries(entries.filter((entry) => !isNullOptional(entry))) as TRecord)
    : record;
}

/**
 * Reads an interaction record from the store, with every optional field that is `null` dropped.
 *
 * @param record - What `consumeInteraction` returned.
 * @returns The record, without `null` optional fields, or `undefined` as given.
 */
export const readInteractionRecord = (record: InteractionRecord | undefined): InteractionRecord | undefined =>
  record === undefined ? undefined : withoutNulls(record, INTERACTION_OPTIONAL);

/**
 * Reads a code record from the store, with every optional field that is `null` dropped.
 *
 * @param record - The record of a `consumed` code.
 * @returns The record, without `null` optional fields.
 */
export const readCodeRecord = (record: CodeRecord): CodeRecord => withoutNulls(record, CODE_OPTIONAL);

/**
 * Reads an access token record from the store, with every optional field that is `null` dropped.
 *
 * @param record - What `findAccessToken` returned.
 * @returns The record, without `null` optional fields.
 */
export const readAccessTokenRecord = (record: AccessTokenRecord): AccessTokenRecord =>
  withoutNulls(record, ACCESS_TOKEN_OPTIONAL);

/**
 * Reads a refresh token record from the store, with every optional field that is `null` dropped.
 *
 * @param record - The record of a `consumed` refresh token.
 * @returns The record, without `null` optional fields.
 */
export const readRefreshTokenRecord = (record: RefreshTokenRecord): RefreshTokenRecord =>
  withoutNulls(record, REFRESH_TOKEN_OPTIONAL);
