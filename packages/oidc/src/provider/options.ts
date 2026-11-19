import type { KeyPair, PublicKey } from "@codenhub/jwt";

import { deepFreeze } from "../shared/result";
import { isHttpsUrl } from "../shared/urls";
import type {
  AccessTokenClaimsRequest,
  AccessTokenFormat,
  ClaimsRequest,
  OidcStore,
  ProviderDiagnostic,
  ProviderEndpoints,
  ProviderOptions,
  RefreshCheck,
} from "./types";

/** Claims each standard scope releases (OpenID Connect Core §5.4). */
const STANDARD_SCOPE_CLAIMS: Readonly<Record<string, readonly string[]>> = {
  profile: [
    "name",
    "family_name",
    "given_name",
    "middle_name",
    "nickname",
    "preferred_username",
    "profile",
    "picture",
    "website",
    "gender",
    "birthdate",
    "zoneinfo",
    "locale",
    "updated_at",
  ],
  email: ["email", "email_verified"],
  address: ["address"],
  phone: ["phone_number", "phone_number_verified"],
};

/** Scopes with a protocol meaning, which release no claims and cannot be redefined. */
export const PROTOCOL_SCOPES: readonly string[] = ["openid", "offline_access"];

/** A scope token (RFC 6749 §3.3): printable ASCII except space, `"` and `\`. */
export const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;

/**
 * A subject identifier: 1 to 255 characters of visible ASCII. OpenID Connect Core §2 caps `sub` at 255 ASCII
 * characters; a space or control character is refused too, since every relying party compares `sub` byte for byte.
 */
export const SUBJECT = /^[!-~]{1,255}$/;

const SECONDS_PER_DAY = 86_400;

interface TtlRule {
  readonly fallback: number;
  readonly minimum: number;
  readonly maximum: number;
}

const TTL_RULES = {
  code: { fallback: 60, minimum: 1, maximum: 600 },
  interaction: { fallback: 1800, minimum: 60, maximum: SECONDS_PER_DAY },
  accessToken: { fallback: 600, minimum: 60, maximum: SECONDS_PER_DAY },
  idToken: { fallback: 600, minimum: 60, maximum: SECONDS_PER_DAY },
  refreshToken: { fallback: 30 * SECONDS_PER_DAY, minimum: 60, maximum: 365 * SECONDS_PER_DAY },
} as const satisfies Record<string, TtlRule>;

/** Token lifetimes in seconds, every one resolved. */
export type ResolvedTtl = { readonly [K in keyof typeof TTL_RULES]: number };

/** The lifetimes a client's record may set for itself: every one except the interaction's, which is provider-wide. */
export const CLIENT_TTL_NAMES = [
  "code",
  "accessToken",
  "idToken",
  "refreshToken",
] as const satisfies readonly (keyof ResolvedTtl)[];

/** Whether `value` is an allowed lifetime for `name`: an integer within the range the provider's own option has. */
export const isTtlInRange = (name: keyof ResolvedTtl, value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= TTL_RULES[name].minimum &&
  (value as number) <= TTL_RULES[name].maximum;

/** The requirement a lifetime's value must meet, as an error message names it. */
export const describeTtlRange = (name: keyof ResolvedTtl): string =>
  `an integer from ${TTL_RULES[name].minimum} through ${TTL_RULES[name].maximum}`;

/** Absolute URLs of every endpoint the provider answers. */
export interface ResolvedEndpoints {
  readonly discovery: string;
  readonly authorization: string;
  readonly token: string;
  readonly userinfo: string;
  readonly jwks: string;
  readonly revocation: string;
  readonly endSession: string;
}

/** Provider options after validation, as every endpoint reads them. */
export interface ResolvedOptions {
  readonly issuer: string;
  readonly endpoints: ResolvedEndpoints;
  /** The pair that signs JWT access tokens: the first one given. */
  readonly signingKey: KeyPair;
  /** Every pair, in the order given, from which an ID token's signing key is chosen; see {@link selectIdTokenKey}. */
  readonly signingKeys: readonly KeyPair[];
  /** The signing pairs' public halves, in order: the algorithms a client's `idTokenSigningAlg` may name. */
  readonly publicKeys: readonly PublicKey[];
  /**
   * Every key the JWKS publishes and an `id_token_hint` may be signed by: the signing pairs' public halves, then the
   * `verificationKeys`, which never sign.
   */
  readonly publishedKeys: readonly PublicKey[];
  /** Extra discovery members, a deep-frozen copy of the `metadata` option; buildMetadata refuses a computed one. */
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly store: OidcStore;
  readonly claims: (
    request: ClaimsRequest,
  ) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;
  /** Every scope a client may request, with the claims it releases; `openid` and `offline_access` release none. */
  readonly scopeClaims: ReadonlyMap<string, readonly string[]>;
  readonly ttl: ResolvedTtl;
  readonly accessToken: AccessTokenFormat;
  /** Current time in seconds since the Unix epoch, truncated to whole seconds. */
  readonly now: () => number;
  readonly onDiagnostic: ((diagnostic: ProviderDiagnostic, request: Request) => void) | undefined;
  readonly onRefresh: ((request: RefreshCheck) => boolean | Promise<boolean>) | undefined;
  readonly subjectTypes: readonly string[];
  readonly accessTokenClaims:
    | ((
        request: AccessTokenClaimsRequest,
      ) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>)
    | undefined;
}

const STORE_METHODS = [
  "findClient",
  "saveInteraction",
  "consumeInteraction",
  "saveCode",
  "consumeCode",
  "saveAccessToken",
  "findAccessToken",
  "saveRefreshToken",
  "consumeRefreshToken",
  "revokeGrant",
] as const satisfies readonly (keyof OidcStore)[];

const fail = (name: string, requirement: string): never => {
  throw new TypeError(`createProvider: ${name} ${requirement}`);
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Longest unknown option name quoted in a message; a longer one is cut and ends in `...`, as `@codenhub/jwt` does. */
const MAX_OPTION_NAME_LENGTH = 64;

/**
 * Throws when `options` has an own enumerable string key that `known` does not list, so a misspelled option such as
 * `endpoints.authorize` fails at startup instead of silently keeping the default. A member whose value is `undefined`
 * still counts. `prefix` is the path of the nested object, such as `endpoints.`, or empty at the top level.
 */
function rejectUnknownOptions(options: object, known: Readonly<Record<string, unknown>>, prefix: string): void {
  for (const name of Object.keys(options)) {
    if (!Object.hasOwn(known, name)) {
      const shown = name.length > MAX_OPTION_NAME_LENGTH ? `${name.slice(0, MAX_OPTION_NAME_LENGTH)}...` : name;
      fail(`${prefix}${shown}`, "is not an option");
    }
  }
}

/** Every member of {@link ProviderOptions}; the type keeps the list complete. */
const PROVIDER_OPTIONS = {
  issuer: true,
  signingKeys: true,
  verificationKeys: true,
  store: true,
  claims: true,
  scopes: true,
  ttl: true,
  accessToken: true,
  endpoints: true,
  now: true,
  onDiagnostic: true,
  onRefresh: true,
  accessTokenClaims: true,
  subjectTypes: true,
  metadata: true,
} as const satisfies Record<keyof ProviderOptions, true>;

const CANONICAL_URL =
  "must be written as the URL parser serializes it: a lowercase scheme and host, no default port, no dot segments, and percent-encoding as the parser writes it";

/**
 * Whether a URL is written as the URL parser serializes it, so the string compared byte for byte is the URL every
 * party resolves: `https://OP.example`, a `:443` port or a dot segment would be one URL under two spellings. The
 * parser adds `/` to an empty path, so `https://op.example` stands for `https://op.example/` and is accepted.
 */
function isCanonicalUrl(value: string): boolean {
  const { href, pathname, search } = new URL(value);
  return href === value || (pathname === "/" && search === "" && href === `${value}/`);
}

/**
 * Checks the issuer: an `https` URL without query, fragment, or credentials (OpenID Connect Discovery §2), written as
 * the URL parser serializes it.
 */
function readIssuer(issuer: unknown): string {
  if (!isHttpsUrl(issuer) || new URL(issuer).search !== "" || issuer.includes("?")) {
    return fail("issuer", "must be an https URL without query, fragment, or credentials");
  }
  if (!isCanonicalUrl(issuer)) {
    return fail("issuer", CANONICAL_URL);
  }
  return issuer;
}

const ENDPOINT_OPTIONS = {
  authorization: true,
  token: true,
  userinfo: true,
  jwks: true,
  revocation: true,
  endSession: true,
} as const satisfies Record<keyof ProviderEndpoints, true>;

function readEndpoints(issuer: string, endpoints: unknown): ResolvedEndpoints {
  if (endpoints !== undefined && !isRecord(endpoints)) {
    return fail("endpoints", "must be an object");
  }
  if (isRecord(endpoints)) {
    rejectUnknownOptions(endpoints, ENDPOINT_OPTIONS, "endpoints.");
  }
  const base = issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;
  const read = (
    name: "authorization" | "token" | "userinfo" | "jwks" | "revocation" | "endSession",
    path: string,
  ): string => {
    // Only `undefined` takes the default: an explicit `null` is a mistake to report, not a request for the default.
    const given = isRecord(endpoints) ? endpoints[name] : undefined;
    const value = given === undefined ? `${base}${path}` : given;
    if (!isHttpsUrl(value)) {
      return fail(`endpoints.${name}`, "must be an https URL without fragment or credentials");
    }
    if (!isCanonicalUrl(value)) {
      return fail(`endpoints.${name}`, CANONICAL_URL);
    }
    return value;
  };
  const resolved = {
    discovery: `${base}/.well-known/openid-configuration`,
    authorization: read("authorization", "/authorize"),
    token: read("token", "/token"),
    userinfo: read("userinfo", "/userinfo"),
    jwks: read("jwks", "/jwks"),
    revocation: read("revocation", "/revoke"),
    endSession: read("endSession", "/logout"),
  };
  // `handle` routes by origin and path, so two endpoints at one place would make one unreachable.
  const places = Object.values(resolved).map((url) => {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
  });
  if (new Set(places).size !== places.length) {
    fail("endpoints", "must each have their own origin and path");
  }
  return resolved;
}

function readSigningKeys(signingKeys: unknown): readonly KeyPair[] {
  if (!Array.isArray(signingKeys) || signingKeys.length === 0) {
    return fail("signingKeys", "must be a non-empty array of key pairs");
  }
  const kids = new Set<string>();
  for (const pair of signingKeys as unknown[]) {
    if (!isRecord(pair) || !isRecord(pair.privateKey) || !isRecord(pair.publicKey)) {
      return fail("signingKeys", "must hold { privateKey, publicKey } pairs");
    }
    const { privateKey, publicKey } = pair;
    if (privateKey.kind !== "private" || publicKey.kind !== "public" || privateKey.alg !== publicKey.alg) {
      return fail("signingKeys", "must pair a private and a public key of one algorithm");
    }
    if (typeof privateKey.kid !== "string" || privateKey.kid === "" || privateKey.kid !== publicKey.kid) {
      return fail("signingKeys", "must give both keys of a pair the same non-empty kid");
    }
    if (kids.has(privateKey.kid)) {
      return fail("signingKeys", "must not repeat a kid");
    }
    kids.add(privateKey.kid);
  }
  return signingKeys as readonly KeyPair[];
}

/** Verification keys a provider publishes: a few incoming or retiring keys, and a bound on the JWKS. */
const MAX_VERIFICATION_KEYS = 16;

/**
 * Checks the public keys published beside the signing keys, which never sign: each a public key with a non-empty
 * `kid` that no other published key has. Bounded before the copy, and a hole is read as `undefined`, so a sparse
 * list is refused rather than skipped.
 */
function readVerificationKeys(verificationKeys: unknown, signingKeys: readonly KeyPair[]): readonly PublicKey[] {
  if (verificationKeys === undefined) {
    return [];
  }
  if (!Array.isArray(verificationKeys) || verificationKeys.length > MAX_VERIFICATION_KEYS) {
    return fail("verificationKeys", `must be an array of at most ${MAX_VERIFICATION_KEYS} public keys`);
  }
  const kids = new Set(signingKeys.map((pair) => pair.publicKey.kid));
  for (const key of Array.from(verificationKeys as unknown[])) {
    if (!isRecord(key) || key.kind !== "public" || typeof key.alg !== "string") {
      return fail("verificationKeys", "must hold public keys from @codenhub/jwt");
    }
    if (typeof key.kid !== "string" || key.kid === "") {
      return fail("verificationKeys", "must give every key a non-empty kid");
    }
    if (kids.has(key.kid)) {
      return fail("verificationKeys", "must not repeat a kid, of each other or of a signing key");
    }
    kids.add(key.kid);
  }
  return Object.freeze([...(verificationKeys as PublicKey[])]);
}

/**
 * The pair that signs a client's ID tokens: the first of the algorithm the client names, or without one the first
 * `RS256` pair (OpenID Connect Core §15.1 requires it, and Registration makes it the default), or else the first pair.
 *
 * @throws {TypeError} When the client names an algorithm no pair has.
 */
export function selectIdTokenKey(
  options: Pick<ResolvedOptions, "signingKeys">,
  client: { readonly idTokenSigningAlg?: string },
): KeyPair {
  const wanted = client.idTokenSigningAlg ?? "RS256";
  const found = options.signingKeys.find((pair) => pair.privateKey.alg === wanted);
  if (found === undefined && client.idTokenSigningAlg !== undefined) {
    throw new TypeError("a client record names an idTokenSigningAlg that no signing key has");
  }
  return found ?? (options.signingKeys[0] as KeyPair);
}

function readStore(store: unknown): OidcStore {
  if (!isRecord(store)) {
    return fail("store", "must be an object");
  }
  for (const method of STORE_METHODS) {
    if (typeof store[method] !== "function") {
      fail(`store.${method}`, "must be a function");
    }
  }
  return store as unknown as OidcStore;
}

function readScopes(scopes: unknown): ReadonlyMap<string, readonly string[]> {
  if (scopes !== undefined && (!isRecord(scopes) || Array.isArray(scopes))) {
    return fail("scopes", "must be an object");
  }
  const resolved = new Map<string, readonly string[]>(PROTOCOL_SCOPES.map((scope) => [scope, []]));
  for (const [scope, claims] of Object.entries(STANDARD_SCOPE_CLAIMS)) {
    resolved.set(scope, claims);
  }
  for (const [scope, claims] of Object.entries(scopes ?? {})) {
    if (!SCOPE_TOKEN.test(scope) || PROTOCOL_SCOPES.includes(scope)) {
      fail("scopes", "must use scope tokens other than openid and offline_access as keys");
    }
    if (
      !Array.isArray(claims) ||
      claims.some((claim) => typeof claim !== "string" || claim === "" || claim === "sub")
    ) {
      fail(`scopes.${scope}`, "must be an array of claim names other than sub");
    }
    resolved.set(scope, Object.freeze([...(claims as string[])]));
  }
  return resolved;
}

const SUBJECT_TYPES: readonly string[] = ["public", "pairwise"];
const PUBLIC_ONLY: readonly string[] = Object.freeze(["public"]);

/** Reads the subject types to publish: a non-empty list of `public` and `pairwise`, each once. */
function readSubjectTypes(subjectTypes: unknown): readonly string[] {
  if (subjectTypes === undefined) {
    return PUBLIC_ONLY;
  }
  // Bounded before the copy, since a list without repeats holds at most every type once. `Array.from` reads a hole
  // as `undefined`, so a sparse list is refused rather than skipped.
  const types =
    Array.isArray(subjectTypes) && subjectTypes.length <= SUBJECT_TYPES.length
      ? Array.from(subjectTypes as unknown[])
      : [];
  if (
    types.length === 0 ||
    !types.every((type) => SUBJECT_TYPES.includes(type as string)) ||
    new Set(types).size !== types.length
  ) {
    return fail("subjectTypes", "must be a non-empty array of public and pairwise, without repeats");
  }
  return Object.freeze(types as string[]);
}

const OPAQUE: AccessTokenFormat = Object.freeze({ format: "opaque" });
const OPAQUE_OPTIONS = { format: true } as const;
const JWT_OPTIONS = { format: true, audience: true } as const;

function readAccessTokenFormat(accessToken: unknown): AccessTokenFormat {
  if (accessToken === undefined) {
    return OPAQUE;
  }
  if (!isRecord(accessToken) || (accessToken.format !== "opaque" && accessToken.format !== "jwt")) {
    return fail("accessToken.format", 'must be "opaque" or "jwt"');
  }
  if (accessToken.format === "opaque") {
    rejectUnknownOptions(accessToken, OPAQUE_OPTIONS, "accessToken.");
    return OPAQUE;
  }
  rejectUnknownOptions(accessToken, JWT_OPTIONS, "accessToken.");
  // RFC 9068 §2.2 requires `aud`; there is no sensible default, since it names the resource server, not the provider.
  if (typeof accessToken.audience !== "string" || accessToken.audience === "" || !accessToken.audience.isWellFormed()) {
    return fail("accessToken.audience", "must be a non-empty string of well-formed Unicode for JWT access tokens");
  }
  return Object.freeze({ format: "jwt", audience: accessToken.audience });
}

function readTtl(ttl: unknown): ResolvedTtl {
  if (ttl !== undefined && !isRecord(ttl)) {
    return fail("ttl", "must be an object");
  }
  if (isRecord(ttl)) {
    rejectUnknownOptions(ttl, TTL_RULES, "ttl.");
  }
  const resolved: Record<string, number> = {};
  for (const [name, rule] of Object.entries(TTL_RULES) as [keyof ResolvedTtl, TtlRule][]) {
    // Only `undefined` takes the fallback, so an explicit `null` is rejected below like any other non-integer.
    const given = isRecord(ttl) ? ttl[name] : undefined;
    const value = given === undefined ? rule.fallback : given;
    if (!isTtlInRange(name, value)) {
      fail(`ttl.${name}`, `must be ${describeTtlRange(name)}`);
    }
    resolved[name] = value as number;
  }
  return resolved as ResolvedTtl;
}

/** Bounds on the `metadata` option: how deeply its values nest, and how long it is as JSON. */
const MAX_METADATA_DEPTH = 16;
const MAX_METADATA_LENGTH = 16384;

/**
 * Copies one value of the `metadata` option, refusing anything JSON would not carry as written: `undefined`, a
 * function, a symbol, a `bigint`, a number that is not finite, a string that is not well-formed Unicode, a sparse
 * array, an accessor, or an object that is not plain, such as a `Date` or a class instance. Depth is bounded, which
 * also ends a cycle, and so is the count of values visited, since each one is at least a character of JSON: a value
 * shared many times over cannot make the copy run long. Members are copied with `Object.fromEntries`, so one named
 * `__proto__` stays a plain member.
 */
function copyMetadataValue(value: unknown, depth: number, budget: { visits: number }): unknown {
  budget.visits += 1;
  if (budget.visits > MAX_METADATA_LENGTH) {
    return fail("metadata", `must be at most ${MAX_METADATA_LENGTH} characters as JSON`);
  }
  if (depth > MAX_METADATA_DEPTH) {
    return fail("metadata", `must nest at most ${MAX_METADATA_DEPTH} levels deep`);
  }
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fail("metadata", "must hold only finite numbers");
  }
  if (typeof value === "string") {
    return value.isWellFormed() ? value : fail("metadata", "must hold only well-formed Unicode strings");
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_METADATA_LENGTH) {
      return fail("metadata", `must be at most ${MAX_METADATA_LENGTH} characters as JSON`);
    }
    return Array.from({ length: value.length }, (_, index) => {
      if (!Object.hasOwn(value, index)) {
        return fail("metadata", "must not hold a sparse array");
      }
      return copyMetadataValue(value[index], depth + 1, budget);
    });
  }
  if (typeof value !== "object" || !isPlainObject(value)) {
    return fail(
      "metadata",
      "must hold only JSON data: null, booleans, finite numbers, strings, arrays and plain objects",
    );
  }
  return Object.fromEntries(
    Object.keys(value).map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (descriptor === undefined || !("value" in descriptor)) {
        return fail("metadata", "must not hold an accessor property");
      }
      return [name, copyMetadataValue(descriptor.value, depth + 1, budget)];
    }),
  );
}

const isPlainObject = (value: object): boolean => {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Reads the extra discovery members: a plain object of JSON data, at most {@link MAX_METADATA_LENGTH} characters as
 * JSON. A member the provider computes is refused where the document is built, by `buildMetadata`.
 */
function readMetadata(metadata: unknown): Readonly<Record<string, unknown>> {
  if (metadata === undefined) {
    return EMPTY_METADATA;
  }
  if (!isRecord(metadata) || Array.isArray(metadata) || !isPlainObject(metadata)) {
    return fail("metadata", "must be a plain object");
  }
  if (Object.keys(metadata).includes("")) {
    return fail("metadata", "must not have a member with an empty name");
  }
  const copy = copyMetadataValue(metadata, 0, { visits: 0 }) as Record<string, unknown>;
  if (JSON.stringify(copy).length > MAX_METADATA_LENGTH) {
    return fail("metadata", `must be at most ${MAX_METADATA_LENGTH} characters as JSON`);
  }
  return deepFreeze(copy);
}

const EMPTY_METADATA: Readonly<Record<string, unknown>> = Object.freeze({});

/**
 * Validates provider options once, at creation.
 *
 * @throws {TypeError} For any invalid option; the message names the option, never its value.
 */
export function resolveOptions(options: ProviderOptions): ResolvedOptions {
  if (!isRecord(options)) {
    return fail("options", "must be an object");
  }
  rejectUnknownOptions(options, PROVIDER_OPTIONS, "");
  const issuer = readIssuer(options.issuer);
  const signingKeys = readSigningKeys(options.signingKeys);
  const publicKeys = Object.freeze(signingKeys.map((pair) => pair.publicKey));
  if (typeof options.claims !== "function") {
    fail("claims", "must be a function");
  }
  if (options.now !== undefined && typeof options.now !== "function") {
    fail("now", "must be a function");
  }
  if (options.onDiagnostic !== undefined && typeof options.onDiagnostic !== "function") {
    fail("onDiagnostic", "must be a function");
  }
  if (options.onRefresh !== undefined && typeof options.onRefresh !== "function") {
    fail("onRefresh", "must be a function");
  }
  const accessToken = readAccessTokenFormat(options.accessToken);
  if (options.accessTokenClaims !== undefined) {
    if (typeof options.accessTokenClaims !== "function") {
      fail("accessTokenClaims", "must be a function");
    }
    if (accessToken.format !== "jwt") {
      fail("accessTokenClaims", 'requires accessToken.format "jwt", since an opaque token carries no claims');
    }
  }
  const clock = options.now ?? Date.now;
  return Object.freeze({
    issuer,
    endpoints: Object.freeze(readEndpoints(issuer, options.endpoints)),
    signingKey: signingKeys[0] as KeyPair,
    signingKeys: Object.freeze([...signingKeys]),
    publicKeys,
    publishedKeys: Object.freeze([...publicKeys, ...readVerificationKeys(options.verificationKeys, signingKeys)]),
    metadata: readMetadata(options.metadata),
    store: readStore(options.store),
    claims: options.claims,
    scopeClaims: readScopes(options.scopes),
    ttl: Object.freeze(readTtl(options.ttl)),
    accessToken,
    now: () => Math.floor(clock() / 1000),
    onDiagnostic: options.onDiagnostic,
    onRefresh: options.onRefresh,
    subjectTypes: readSubjectTypes(options.subjectTypes),
    accessTokenClaims: options.accessTokenClaims,
  });
}
