import type { ProviderMetadata } from "../shared/types";
import { isHttpsUrl, isRedirectUri } from "../shared/urls";
import { readTenantIssuer, TENANT_PLACEHOLDER, type TenantRule } from "./issuer";
import { checkMetadata, ID_TOKEN_ALGORITHMS, type IdTokenAlgorithm, type MetadataMode } from "./metadata";
import type { AssertionAudience, AssertionHeader, ClientAuth, ClientOptions, OAuthClientOptions } from "./types";

/** Every error this module throws starts with this, so a caller can tell which factory refused. */
const PREFIX = "createClient:";

const AUTH_METHODS: ReadonlySet<string> = new Set([
  "none",
  "client_secret_basic",
  "client_secret_post",
  "client_secret_jwt",
  "private_key_jwt",
]);

const SECONDS_TO_MILLISECONDS = 1000;

/** The certificate thumbprints a `private_key_jwt` assertion may carry, and the base64url length of each digest. */
const THUMBPRINT_LENGTHS: ReadonlyMap<string, number> = new Map([
  ["x5t", 27],
  ["x5t#S256", 43],
]);

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Client options after validation, as every operation reads them. Frozen. */
export interface ResolvedClientOptions {
  readonly metadata: ProviderMetadata;
  readonly clientId: string;
  readonly redirectUri: string | undefined;
  readonly auth: ClientAuth;
  readonly fetch: typeof fetch | undefined;
  readonly timeoutMs: number;
  readonly clockTolerance: number;
  /** Milliseconds since the Unix epoch. */
  readonly now: () => number;
  /** Asymmetric algorithms the client accepts for ID tokens: the provider's advertised ones this package supports. */
  readonly idTokenAlgorithms: readonly IdTokenAlgorithm[];
  /** Whether a logout token must carry `sid`: `backchannelLogout.sessionRequired`. */
  readonly logoutSessionRequired: boolean;
  /** `false` for a plain OAuth 2.0 client, which handles no ID token. */
  readonly openid: boolean;
  /** How a `{tenantid}` issuer template is resolved, or `undefined` when the issuer matches exactly. */
  readonly tenant: TenantRule | undefined;
}

interface IntegerRange {
  /** The option's name, prefixed as the message should read, such as `createClient: timeout`. */
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly fallback: number;
}

/**
 * Reads an optional integer option. Its message names the option and its range, never the value, so a
 * secret or a token passed by mistake is not echoed back.
 */
function readBoundedInteger(value: unknown, range: IntegerRange): number {
  if (value === undefined) {
    return range.fallback;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= range.min && value <= range.max) {
    return value;
  }
  throw new TypeError(`${range.label} must be an integer from ${range.min} through ${range.max}`);
}

/**
 * Reads a timeout in seconds, shared by `discover` and `createClient` so both bound it the same way. A
 * provider that takes longer than a minute is treated as unreachable.
 *
 * @internal
 */
export const readTimeoutSeconds = (value: unknown, label: string): number =>
  readBoundedInteger(value, { label, min: 1, max: 60, fallback: 5 });

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

/**
 * The issuer as an own data value. Read from the descriptor so a getter is never run; an accessor or a
 * missing or non-string issuer reads as `""`, which the https check refuses.
 */
function readIssuer(metadata: unknown): string {
  if (!isObject(metadata) || !Object.hasOwn(metadata, "issuer")) {
    return "";
  }
  const value = Object.getOwnPropertyDescriptor(metadata, "issuer")?.value;
  return typeof value === "string" ? value : "";
}

/** Checks the metadata with the same rules as a fetched document, and names the first member that fails. */
function readMetadata(metadata: ProviderMetadata, mode: MetadataMode): ProviderMetadata {
  const issuer = readIssuer(metadata);
  // A hand-written document is held to the issuer rules `discover` applies to its argument. A `{tenantid}` template
  // is checked as the issuer of one tenant, since braces are not URL characters.
  const checked = issuer.replaceAll(TENANT_PLACEHOLDER, "tenant");
  if (!isHttpsUrl(checked) || checked.includes("?")) {
    throw new TypeError(
      `${PREFIX} metadata.issuer must be an own data property holding an https URL without query, fragment, or credentials`,
    );
  }
  const result = checkMetadata(metadata, issuer, { mode });
  if (result.ok) {
    return result.value;
  }
  const [issue] = result.error.issues;
  const place = issue.path?.join(".") ?? "metadata";
  throw new TypeError(`${PREFIX} ${place} is not valid provider metadata`);
}

/**
 * A string that is well-formed Unicode. `encodeURIComponent` throws `URIError` on a lone surrogate, and that
 * would surface later, outside any result, so it is refused here at creation.
 */
const isWellFormedString = (value: unknown): value is string => typeof value === "string" && value.isWellFormed();

function readClientId(clientId: unknown): string {
  if (!isWellFormedString(clientId) || clientId === "") {
    throw new TypeError(`${PREFIX} clientId must be a non-empty string of well-formed Unicode`);
  }
  return clientId;
}

function readRedirectUri(redirectUri: unknown): string | undefined {
  // `isRedirectUri` accepts visible ASCII only, which also refuses a lone surrogate.
  if (redirectUri !== undefined && !isRedirectUri(redirectUri)) {
    throw new TypeError(
      `${PREFIX} redirectUri must be an absolute URI of visible ASCII, without fragment or credentials, and not javascript:, data:, vbscript: or file:`,
    );
  }
  return redirectUri;
}

function readSecret(secret: unknown): string {
  if (!isWellFormedString(secret) || secret === "") {
    throw new TypeError(`${PREFIX} auth.secret must be a non-empty string of well-formed Unicode`);
  }
  return secret;
}

/**
 * Checks that a key is of the kind the method needs. The key itself is checked by `@codenhub/jwt` when
 * it signs, so this only catches the wrong kind early, at creation.
 */
function checkKeyKind(key: unknown, kind: "private" | "secret"): void {
  if (!isObject(key) || !("kind" in key) || key.kind !== kind) {
    throw new TypeError(`${PREFIX} auth.key must be a ${kind} key from @codenhub/jwt`);
  }
}

/**
 * Checks the auth method against the provider's advertised methods. A method the provider does not list
 * would fail at the token endpoint, so it is refused here, at creation.
 */
function checkAdvertised(metadata: ProviderMetadata, method: string): void {
  const advertised = metadata.token_endpoint_auth_methods_supported;
  if (advertised !== undefined && !advertised.includes(method)) {
    throw new TypeError(`${PREFIX} auth.method is not in metadata.token_endpoint_auth_methods_supported`);
  }
}

/**
 * Checks the key's algorithm against the provider's advertised client-assertion algorithms. A key the provider
 * does not list would fail every token request, so it is refused here. An absent member means the provider has
 * not stated them (OpenID Connect Discovery), so any key is accepted.
 */
function checkAssertionAlgorithm(metadata: ProviderMetadata, key: { readonly alg: string }): void {
  const advertised = metadata.token_endpoint_auth_signing_alg_values_supported;
  if (advertised !== undefined && !advertised.includes(key.alg)) {
    throw new TypeError(
      `${PREFIX} auth.key's algorithm is not in metadata.token_endpoint_auth_signing_alg_values_supported`,
    );
  }
}

/**
 * Copies the auth options into a fresh frozen object, so the caller's auth object is never frozen or kept. A
 * secret is copied by value. A key is kept by reference, as given: it is neither copied nor frozen, so the
 * client shares the caller's key object.
 */
function readAuth(auth: ClientAuth, metadata: ProviderMetadata): ClientAuth {
  if (!isObject(auth)) {
    throw new TypeError(`${PREFIX} auth must be an object`);
  }
  if (typeof auth.method !== "string" || !AUTH_METHODS.has(auth.method)) {
    throw new TypeError(
      `${PREFIX} auth.method must be one of none, client_secret_basic, client_secret_post, client_secret_jwt, private_key_jwt`,
    );
  }
  checkAdvertised(metadata, auth.method);
  switch (auth.method) {
    case "none":
      return Object.freeze({ method: "none" });
    case "client_secret_basic":
    case "client_secret_post":
      return Object.freeze({ method: auth.method, secret: readSecret(auth.secret) });
    case "client_secret_jwt":
      checkKeyKind(auth.key, "secret");
      checkAssertionAlgorithm(metadata, auth.key);
      return Object.freeze({
        method: auth.method,
        key: auth.key,
        audience: readAssertionAudience(auth.audience),
      });
    case "private_key_jwt": {
      checkKeyKind(auth.key, "private");
      checkAssertionAlgorithm(metadata, auth.key);
      const header = readAssertionHeader(auth.header);
      return Object.freeze({
        method: auth.method,
        key: auth.key,
        audience: readAssertionAudience(auth.audience),
        ...(header === undefined ? {} : { header }),
      });
    }
  }
}

/**
 * Reads the extra header of a `private_key_jwt` assertion: only `x5t` and `x5t#S256`, each the base64url of a SHA-1
 * or SHA-256 digest. The exact length also refuses a thumbprint written in hex, as certificate tools print it.
 */
function readAssertionHeader(header: unknown): AssertionHeader | undefined {
  if (header === undefined) {
    return undefined;
  }
  if (!isObject(header) || Array.isArray(header)) {
    throw new TypeError(`${PREFIX} auth.header must be an object`);
  }
  const copy: Record<string, string> = {};
  for (const name of Reflect.ownKeys(header)) {
    const length = typeof name === "string" ? THUMBPRINT_LENGTHS.get(name) : undefined;
    if (typeof name !== "string" || length === undefined) {
      throw new TypeError(`${PREFIX} auth.header may hold only x5t and x5t#S256`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(header, name);
    const value: unknown = descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
    if (typeof value !== "string" || value.length !== length || !BASE64URL.test(value)) {
      throw new TypeError(
        `${PREFIX} auth.header.${name} must be the base64url of the certificate's digest: ${length} characters, without padding`,
      );
    }
    copy[name] = value;
  }
  return Object.freeze(copy);
}

function readAssertionAudience(audience: unknown): AssertionAudience {
  if (audience === undefined) {
    return "issuer";
  }
  if (audience !== "issuer" && audience !== "token_endpoint") {
    throw new TypeError(`${PREFIX} auth.audience must be issuer or token_endpoint`);
  }
  return audience;
}

function readOptionalFunction<TFunction extends (...args: never[]) => unknown>(
  value: unknown,
  name: string,
): TFunction | undefined {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError(`${PREFIX} ${name} must be a function`);
  }
  return value as TFunction | undefined;
}

/** The clock is read through `Date.now` at each call, so a test that replaces it sees the change. */
const readNow = (now: unknown): (() => number) => readOptionalFunction<() => number>(now, "now") ?? (() => Date.now());

/** Keeps the algorithms this package verifies that the provider also advertises, in this package's order. */
function readIdTokenAlgorithms(metadata: ProviderMetadata): readonly IdTokenAlgorithm[] {
  const advertised = metadata.id_token_signing_alg_values_supported;
  return Object.freeze(ID_TOKEN_ALGORITHMS.filter((algorithm) => advertised.includes(algorithm)));
}

/** Reads `backchannelLogout`, an optional object whose only member is an optional boolean. */
function readLogoutSessionRequired(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }
  if (!isObject(value)) {
    throw new TypeError(`${PREFIX} backchannelLogout must be an object`);
  }
  const { sessionRequired } = value as { readonly sessionRequired?: unknown };
  if (sessionRequired !== undefined && typeof sessionRequired !== "boolean") {
    throw new TypeError(`${PREFIX} backchannelLogout.sessionRequired must be a boolean`);
  }
  return sessionRequired === true;
}

/**
 * Validates client options and fixes their defaults, so every later operation reads the same values.
 *
 * @param options - The options from the caller. Invalid ones throw, so a misconfigured client never starts.
 * @returns A frozen copy of the options with defaults applied.
 * @throws {TypeError} When `options` is not an object, or one of its members is invalid. The message names
 * the member and never its value.
 */
export function resolveClientOptions(options: ClientOptions | OAuthClientOptions): ResolvedClientOptions {
  if (!isObject(options)) {
    throw new TypeError(`${PREFIX} options must be an object`);
  }
  const openid = readOpenid(options.openid);
  const extra = options as { readonly backchannelLogout?: unknown; readonly tenantIssuer?: unknown };
  if (!openid && (extra.backchannelLogout !== undefined || extra.tenantIssuer !== undefined)) {
    throw new TypeError(`${PREFIX} backchannelLogout and tenantIssuer need ID tokens, which openid: false has none of`);
  }
  const metadata = readMetadata(options.metadata as ProviderMetadata, openid ? "openid" : "oauth");
  const tenant = readTenantIssuer(extra.tenantIssuer, metadata.issuer);
  const auth = readAuth(options.auth, metadata);
  // The template names no one provider, so an assertion addressed to it would be refused.
  if (tenant !== undefined && "audience" in auth && auth.audience === "issuer") {
    throw new TypeError(`${PREFIX} a tenantIssuer client's assertion needs auth.audience "token_endpoint"`);
  }
  return Object.freeze({
    metadata,
    clientId: readClientId(options.clientId),
    redirectUri: readRedirectUri(options.redirectUri),
    auth,
    fetch: readOptionalFunction<typeof fetch>(options.fetch, "fetch"),
    timeoutMs: readTimeoutSeconds(options.timeout, `${PREFIX} timeout`) * SECONDS_TO_MILLISECONDS,
    clockTolerance: readBoundedInteger(options.clockTolerance, {
      label: `${PREFIX} clockTolerance`,
      min: 0,
      max: 300,
      fallback: 60,
    }),
    now: readNow(options.now),
    idTokenAlgorithms: openid ? readIdTokenAlgorithms(metadata) : Object.freeze([]),
    logoutSessionRequired: readLogoutSessionRequired(extra.backchannelLogout),
    openid,
    tenant,
  });
}

function readOpenid(value: unknown): boolean {
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`${PREFIX} openid must be a boolean`);
  }
  return value !== false;
}
