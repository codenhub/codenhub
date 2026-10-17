import type { ProviderMetadata } from "../shared/types";
import { isHttpsUrl, isRedirectUri } from "../shared/urls";
import { checkMetadata, ID_TOKEN_ALGORITHMS, type IdTokenAlgorithm } from "./metadata";
import type { ClientAuth, ClientOptions } from "./types";

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

/** Client options after validation, as every operation reads them. Frozen. */
export interface ResolvedClientOptions {
  readonly metadata: ProviderMetadata;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly auth: ClientAuth;
  readonly fetch: typeof fetch | undefined;
  readonly timeoutMs: number;
  readonly clockTolerance: number;
  /** Milliseconds since the Unix epoch. */
  readonly now: () => number;
  /** Asymmetric algorithms the client accepts for ID tokens: the provider's advertised ones this package supports. */
  readonly idTokenAlgorithms: readonly IdTokenAlgorithm[];
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
function readMetadata(metadata: ProviderMetadata): ProviderMetadata {
  const issuer = readIssuer(metadata);
  // A hand-written document is held to the issuer rules `discover` applies to its argument.
  if (!isHttpsUrl(issuer) || issuer.includes("?")) {
    throw new TypeError(
      `${PREFIX} metadata.issuer must be an own data property holding an https URL without query, fragment, or credentials`,
    );
  }
  const result = checkMetadata(metadata, issuer);
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

function readRedirectUri(redirectUri: unknown): string {
  // `isRedirectUri` accepts visible ASCII only, which also refuses a lone surrogate.
  if (!isRedirectUri(redirectUri)) {
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
      return Object.freeze({ method: auth.method, key: auth.key });
    case "private_key_jwt":
      checkKeyKind(auth.key, "private");
      checkAssertionAlgorithm(metadata, auth.key);
      return Object.freeze({ method: auth.method, key: auth.key });
  }
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

/**
 * Validates client options and fixes their defaults, so every later operation reads the same values.
 *
 * @param options - The options from the caller. Invalid ones throw, so a misconfigured client never starts.
 * @returns A frozen copy of the options with defaults applied.
 * @throws {TypeError} When `options` is not an object, or one of its members is invalid. The message names
 * the member and never its value.
 */
export function resolveClientOptions(options: ClientOptions): ResolvedClientOptions {
  if (!isObject(options)) {
    throw new TypeError(`${PREFIX} options must be an object`);
  }
  const metadata = readMetadata(options.metadata);
  return Object.freeze({
    metadata,
    clientId: readClientId(options.clientId),
    redirectUri: readRedirectUri(options.redirectUri),
    auth: readAuth(options.auth, metadata),
    fetch: readOptionalFunction<typeof fetch>(options.fetch, "fetch"),
    timeoutMs: readTimeoutSeconds(options.timeout, `${PREFIX} timeout`) * SECONDS_TO_MILLISECONDS,
    clockTolerance: readBoundedInteger(options.clockTolerance, {
      label: `${PREFIX} clockTolerance`,
      min: 0,
      max: 300,
      fallback: 0,
    }),
    now: readNow(options.now),
    idTokenAlgorithms: readIdTokenAlgorithms(metadata),
  });
}
