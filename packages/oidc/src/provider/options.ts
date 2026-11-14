import type { KeyPair, PublicKey } from "@codenhub/jwt";

import { isHttpsUrl } from "../shared/urls";
import type {
  AccessTokenClaimsRequest,
  AccessTokenFormat,
  ClaimsRequest,
  OidcStore,
  ProviderDiagnostic,
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
  /** Every public key, published in the JWKS. */
  readonly publicKeys: readonly PublicKey[];
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
  readonly onDiagnostic: ((diagnostic: ProviderDiagnostic) => void) | undefined;
  readonly onRefresh: ((request: RefreshCheck) => boolean | Promise<boolean>) | undefined;
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

/** Checks the issuer: an `https` URL without query, fragment, or credentials (OpenID Connect Discovery §2). */
function readIssuer(issuer: unknown): string {
  if (!isHttpsUrl(issuer) || new URL(issuer).search !== "" || issuer.includes("?")) {
    return fail("issuer", "must be an https URL without query, fragment, or credentials");
  }
  return issuer;
}

function readEndpoints(issuer: string, endpoints: unknown): ResolvedEndpoints {
  if (endpoints !== undefined && !isRecord(endpoints)) {
    return fail("endpoints", "must be an object");
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

const OPAQUE: AccessTokenFormat = Object.freeze({ format: "opaque" });

function readAccessTokenFormat(accessToken: unknown): AccessTokenFormat {
  if (accessToken === undefined) {
    return OPAQUE;
  }
  if (!isRecord(accessToken) || (accessToken.format !== "opaque" && accessToken.format !== "jwt")) {
    return fail("accessToken.format", 'must be "opaque" or "jwt"');
  }
  if (accessToken.format === "opaque") {
    return OPAQUE;
  }
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

/**
 * Validates provider options once, at creation.
 *
 * @throws {TypeError} For any invalid option; the message names the option, never its value.
 */
export function resolveOptions(options: ProviderOptions): ResolvedOptions {
  if (!isRecord(options)) {
    return fail("options", "must be an object");
  }
  const issuer = readIssuer(options.issuer);
  const signingKeys = readSigningKeys(options.signingKeys);
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
    publicKeys: Object.freeze(signingKeys.map((pair) => pair.publicKey)),
    store: readStore(options.store),
    claims: options.claims,
    scopeClaims: readScopes(options.scopes),
    ttl: Object.freeze(readTtl(options.ttl)),
    accessToken,
    now: () => Math.floor(clock() / 1000),
    onDiagnostic: options.onDiagnostic,
    onRefresh: options.onRefresh,
    accessTokenClaims: options.accessTokenClaims,
  });
}
