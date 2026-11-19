import { randomToken } from "../shared/encoding";
import { MAX_PARAMETER_LENGTH, MAX_PARAMETERS, MAX_URL_LENGTH } from "../shared/limits";
import { computeCodeChallenge } from "../shared/pkce";
import { deepFreeze } from "../shared/result";
import type { Prompt } from "../shared/types";
import { isResourceUri } from "../shared/urls";
import type { ResolvedClientOptions } from "./options";
import type { AuthorizationStart, AuthorizeOptions, PendingAuthorization, ResponseMode } from "./types";

const REQUIRED_SCOPE = "openid";
const DEFAULT_SCOPE: readonly string[] = [REQUIRED_SCOPE];
/** RFC 6749 §3.3: printable ASCII except space, `"` and `\`. */
const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
const PROMPT_VALUES: ReadonlySet<string> = new Set<string>(["none", "login", "consent", "select_account", "create"]);
/** A BCP 47 tag has no spaces; a space would split one value into two in the space-joined parameter. */
const LANGUAGE_TAG = /^\S+$/;
/** The provider reads max_age only as one to nine digits, so a larger value would be refused after the redirect. */
const MAX_AGE_LIMIT = 999999999;
const RESPONSE_TYPE = "code";
const MILLISECONDS_PER_SECOND = 1000;
const CODE_CHALLENGE_METHOD = "S256";
/**
 * The most `resource` values a request may send: the provider reads at most {@link MAX_PARAMETERS} per request, and
 * the eight parameters every request sends and four common optional ones leave room for 20. The whole request is
 * also held to {@link MAX_PARAMETERS}, which bounds `resource` and `extraParameters` together.
 */
const MAX_RESOURCES = 20;
const DISPLAY_VALUES: ReadonlySet<string> = new Set(["page", "popup", "touch", "wap"]);
const RESPONSE_MODES: ReadonlySet<string> = new Set(["query", "form_post"]);
/** How deep a `claims` request may nest. OpenID Connect Core §5.5 uses three levels; JSON can carry far more. */
const MAX_CLAIMS_DEPTH = 8;
/** An option name the TypeError may quote, since it is an identifier, not a value: a misspelt `login_hint` is common. */
const OPTION_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Every option `authorize` reads. Any other member throws, so a misspelt option is not silently dropped. */
const KNOWN_OPTIONS: ReadonlySet<string> = new Set([
  "scope",
  "prompt",
  "maxAge",
  "loginHint",
  "uiLocales",
  "resource",
  "acrValues",
  "display",
  "idTokenHint",
  "claimsLocales",
  "claims",
  "responseMode",
  "extraParameters",
]);

/** The options that only an OpenID Provider understands, which a plain OAuth 2.0 client refuses. */
const OPENID_OPTIONS: readonly string[] = ["maxAge", "idTokenHint", "acrValues", "claims", "claimsLocales"];

/**
 * The parameters `extraParameters` may not name: those the client sets itself, which an override would break, and
 * those an option covers, which must go through its checks.
 */
const RESERVED_PARAMETERS: ReadonlySet<string> = new Set([
  "state",
  "nonce",
  "code_challenge",
  "code_challenge_method",
  "redirect_uri",
  "client_id",
  "response_type",
  "response_mode",
  "scope",
  "prompt",
  "max_age",
  "login_hint",
  "ui_locales",
  "acr_values",
  "display",
  "id_token_hint",
  "claims_locales",
  "claims",
  "resource",
  "request",
  "request_uri",
]);

/** The validated, normalized request. Every field is ready to send. */
interface ReadRequest {
  /** `undefined` sends no `scope`, which only a plain OAuth 2.0 client does. */
  readonly scope: readonly string[] | undefined;
  readonly prompt: readonly Prompt[];
  readonly maxAge: number | undefined;
  readonly loginHint: string | undefined;
  readonly uiLocales: readonly string[];
  readonly resource: readonly string[];
  readonly acrValues: readonly string[];
  readonly display: string | undefined;
  readonly idTokenHint: string | undefined;
  readonly claimsLocales: readonly string[];
  /** The `claims` request, JSON-encoded. */
  readonly claims: string | undefined;
  readonly responseMode: ResponseMode;
  readonly extraParameters: readonly (readonly [string, string])[];
}

const isScopeToken = (value: unknown): boolean => typeof value === "string" && SCOPE_TOKEN.test(value);

const isPrompt = (value: unknown): value is Prompt => typeof value === "string" && PROMPT_VALUES.has(value);

const isLanguageTag = (value: unknown): boolean =>
  typeof value === "string" && value.isWellFormed() && LANGUAGE_TAG.test(value);

/**
 * The longest list an option may hold. A request carries at most a few scopes, prompts or locales; the bound
 * keeps an array with a huge `length` from making the copy below run for a long time.
 */
const MAX_LIST_LENGTH = 100;

/**
 * Copies an array by index, or returns `undefined` when it is not an array, is longer than
 * {@link MAX_LIST_LENGTH}, or has a hole. `every` skips holes, so a sparse array would pass a check on its present
 * items and then send `undefined` as a value. The copy also keeps a caller who mutates the array during an
 * `await` from changing what was checked.
 *
 * @internal
 */
export function denseCopy(list: unknown): unknown[] | undefined {
  if (!Array.isArray(list) || list.length > MAX_LIST_LENGTH) {
    return undefined;
  }
  const copy: unknown[] = [];
  for (let index = 0; index < list.length; index += 1) {
    if (!Object.hasOwn(list, index)) {
      return undefined;
    }
    copy.push(list[index]);
  }
  return copy;
}

/**
 * Checks the scope list, de-duplicates it, and requires `openid` of an OpenID client. A missing list defaults to
 * `openid`, or to none for a plain OAuth 2.0 client. The check is on the list itself, not what it becomes, so a
 * provider never gets a scope it did not ask for.
 */
function readScope(scope: readonly string[] | undefined, openid: boolean): readonly string[] | undefined {
  if (scope === undefined) {
    return openid ? DEFAULT_SCOPE : undefined;
  }
  const copy = denseCopy(scope);
  if (copy === undefined || copy.length === 0 || !copy.every(isScopeToken)) {
    throw new TypeError("authorize: scope must be a non-empty array of at most 100 scope tokens");
  }
  if (openid && !copy.includes(REQUIRED_SCOPE)) {
    throw new TypeError("authorize: scope must include openid");
  }
  const unique = [...new Set(copy as string[])];
  // The provider refuses a longer parameter with its own error page, which never reaches this client.
  if (unique.join(" ").length > MAX_PARAMETER_LENGTH) {
    throw new TypeError("authorize: scope is longer than the provider accepts");
  }
  return unique;
}

/**
 * Checks the prompt values. `none` asks the provider to show no UI, so it cannot share the request with a
 * value that asks for UI; OpenID Connect Core §3.1.2.1 forbids the pair.
 */
function readPrompt(prompt: readonly Prompt[] | undefined): readonly Prompt[] {
  if (prompt === undefined) {
    return [];
  }
  const copy = denseCopy(prompt);
  if (copy === undefined || !copy.every(isPrompt)) {
    throw new TypeError(
      "authorize: prompt must be an array of none, login, consent, select_account, or create, of at most 100 entries",
    );
  }
  if (new Set(copy).size !== copy.length) {
    throw new TypeError("authorize: prompt must not repeat a value");
  }
  if (copy.includes("none") && copy.length > 1) {
    throw new TypeError("authorize: prompt none cannot be combined with another value");
  }
  return copy;
}

function readMaxAge(maxAge: number | undefined): number | undefined {
  if (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > MAX_AGE_LIMIT)) {
    throw new TypeError("authorize: maxAge must be an integer from 0 to 999999999");
  }
  return maxAge;
}

/**
 * Reads an optional string parameter, such as a hint, sent as given. `name` is the option the message names, and
 * `maxLength` defaults to the length the provider accepts per parameter.
 */
export function readOptionalString(
  value: unknown,
  name: string,
  maxLength: number = MAX_PARAMETER_LENGTH,
): string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  // A lone surrogate would be sent as U+FFFD, so the provider would see a different value than the caller gave.
  if (value !== undefined && !value.isWellFormed()) {
    throw new TypeError(`${name} must be a string of well-formed Unicode`);
  }
  if (value !== undefined && value.length > maxLength) {
    throw new TypeError(`${name} is longer than the provider accepts`);
  }
  return value;
}

function readLoginHint(loginHint: string | undefined): string | undefined {
  return readOptionalString(loginHint, "authorize: loginHint");
}

/** Reads `ui_locales` for a request. `caller` is the method the message names. */
export function readUiLocales(uiLocales: readonly string[] | undefined, caller = "authorize"): readonly string[] {
  return readSpaceList(uiLocales, `${caller}: uiLocales`);
}

/**
 * Reads a list sent joined with spaces, such as `ui_locales` or `acr_values`: each value non-empty, well-formed
 * Unicode and without spaces, at most 4096 characters joined. `label` is the option the message names.
 */
function readSpaceList(value: unknown, label: string): readonly string[] {
  if (value === undefined) {
    return [];
  }
  const copy = denseCopy(value);
  if (copy === undefined || !copy.every(isLanguageTag)) {
    throw new TypeError(
      `${label} must be an array of at most 100 non-empty strings of well-formed Unicode without spaces`,
    );
  }
  const joined = (copy as string[]).join(" ");
  if (joined.length > MAX_PARAMETER_LENGTH) {
    throw new TypeError(`${label} is longer than the provider accepts`);
  }
  return copy as string[];
}

function readDisplay(display: unknown): string | undefined {
  if (display !== undefined && (typeof display !== "string" || !DISPLAY_VALUES.has(display))) {
    throw new TypeError("authorize: display must be page, popup, touch, or wap");
  }
  return display;
}

/**
 * Tests a value for JSON that `JSON.stringify` writes exactly: `null`, booleans, finite numbers, well-formed strings,
 * dense arrays and plain objects, nested at most {@link MAX_CLAIMS_DEPTH} deep. Anything else would be dropped or
 * changed on the way, so the provider would read another request than the caller wrote.
 */
function isJsonValue(value: unknown, depth: number): boolean {
  if (value === null || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string") {
    return value.isWellFormed();
  }
  if (depth >= MAX_CLAIMS_DEPTH || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    const copy = denseCopy(value);
    return copy !== undefined && copy.every((item) => isJsonValue(item, depth + 1));
  }
  return isPlainObject(value) && Object.values(value).every((item) => isJsonValue(item, depth + 1));
}

/** An object made by a literal or `Object.create(null)`, with no symbol keys: what JSON writes as an object. */
function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && Object.getOwnPropertySymbols(value).length === 0;
}

/** Reads the `claims` request (OpenID Connect Core §5.5) and encodes it as the parameter carries it. */
function readClaims(claims: unknown): string | undefined {
  if (claims === undefined) {
    return undefined;
  }
  if (!isPlainObject(claims) || !isJsonValue(claims, 0)) {
    throw new TypeError(
      `authorize: claims must be a plain object of JSON values, nested at most ${MAX_CLAIMS_DEPTH} deep`,
    );
  }
  const encoded = JSON.stringify(claims);
  if (encoded.length > MAX_PARAMETER_LENGTH) {
    throw new TypeError("authorize: claims is longer than the provider accepts once JSON-encoded");
  }
  return encoded;
}

/** Reads the response mode, which the provider must list when it lists its modes at all. */
function readResponseMode(value: unknown, options: ResolvedClientOptions): ResponseMode {
  if (value === undefined) {
    return "query";
  }
  if (typeof value !== "string" || !RESPONSE_MODES.has(value)) {
    throw new TypeError("authorize: responseMode must be query or form_post");
  }
  const supported = options.metadata.response_modes_supported;
  if (value === "form_post" && supported !== undefined && !supported.includes(value)) {
    throw new TypeError("authorize: metadata.response_modes_supported does not list form_post");
  }
  return value as ResponseMode;
}

/**
 * Reads `extraParameters`: a plain object of non-empty strings, none naming a parameter the client sets or an option
 * covers. The message names a refused parameter, which is always one of a fixed list, and never a value.
 */
function readExtraParameters(value: unknown): readonly (readonly [string, string])[] {
  if (value === undefined) {
    return [];
  }
  if (!isPlainObject(value)) {
    throw new TypeError("authorize: extraParameters must be a plain object of strings");
  }
  const names = Object.keys(value);
  // More than the provider reads in a whole request can never be sent, so the walk stops early.
  if (names.length > MAX_PARAMETERS) {
    throw new TypeError(`authorize: extraParameters has more than ${MAX_PARAMETERS} parameters`);
  }
  return names.map((name) => {
    if (RESERVED_PARAMETERS.has(name)) {
      throw new TypeError(
        `authorize: extraParameters cannot set ${name}, which the client sets itself or an option covers`,
      );
    }
    if (name === "" || !name.isWellFormed() || name.length > MAX_PARAMETER_LENGTH) {
      throw new TypeError(
        "authorize: each extraParameters name must be a non-empty string of well-formed Unicode, at most 4096 characters",
      );
    }
    const parameter = value[name];
    if (typeof parameter !== "string" || parameter === "") {
      throw new TypeError("authorize: each extraParameters value must be a non-empty string");
    }
    readOptionalString(parameter, "authorize: an extraParameters value");
    return [name, parameter] as const;
  });
}

/**
 * Refuses an option `authorize` does not read, and one a plain OAuth 2.0 client cannot use. The name is quoted only
 * when it looks like an identifier, so a value passed as a key by mistake is not echoed.
 */
function checkOptionNames(request: object, openid: boolean): void {
  for (const name of Object.keys(request)) {
    const label = OPTION_NAME.test(name) ? name : "a member";
    if (!KNOWN_OPTIONS.has(name)) {
      throw new TypeError(`authorize: ${label} is not an option; see AuthorizeOptions for the ones it reads`);
    }
    if (!openid && OPENID_OPTIONS.includes(name) && (request as Record<string, unknown>)[name] !== undefined) {
      throw new TypeError(`authorize: ${name} needs an OpenID Provider, and this client has openid: false`);
    }
  }
}

/**
 * Reads the `resource` values of a request (RFC 8707 §2), each sent as a parameter of its own. A value is checked as
 * the provider checks a client's `resources`: an absolute URI of visible ASCII without a fragment. Duplicates are
 * dropped in first-seen order, since the provider counts a repeated value once. `caller` is the method the message
 * names.
 */
export function readResources(value: unknown, caller: string): readonly string[] {
  if (value === undefined) {
    return [];
  }
  // Copied by index, so a sparse or oversized array is refused rather than serialized.
  const copy = denseCopy(value);
  if (copy === undefined || copy.length === 0 || copy.length > MAX_RESOURCES || !copy.every(isResourceUri)) {
    throw new TypeError(
      `${caller}: resource must be a non-empty array of at most ${MAX_RESOURCES} absolute URIs of visible ASCII without a fragment or a backslash, with an authority after // for a special scheme such as https`,
    );
  }
  const unique = [...new Set(copy as string[])];
  if (unique.some((resource) => resource.length > MAX_PARAMETER_LENGTH)) {
    throw new TypeError(`${caller}: resource is longer than the provider accepts`);
  }
  return unique;
}

/** Validates the whole request before anything is generated, so a refused request has no side effects. */
function readRequest(request: AuthorizeOptions, options: ResolvedClientOptions): ReadRequest {
  checkOptionNames(request, options.openid);
  return {
    scope: readScope(request.scope, options.openid),
    prompt: readPrompt(request.prompt),
    maxAge: readMaxAge(request.maxAge),
    loginHint: readLoginHint(request.loginHint),
    uiLocales: readUiLocales(request.uiLocales),
    resource: readResources(request.resource, "authorize"),
    acrValues: readSpaceList(request.acrValues, "authorize: acrValues"),
    display: readDisplay(request.display),
    // The provider issued the hint, so it decides how long a hint it accepts; only the URL limit applies.
    idTokenHint: readOptionalString(request.idTokenHint, "authorize: idTokenHint", Number.POSITIVE_INFINITY),
    claimsLocales: readSpaceList(request.claimsLocales, "authorize: claimsLocales"),
    claims: readClaims(request.claims),
    responseMode: readResponseMode(request.responseMode, options),
    extraParameters: readExtraParameters(request.extraParameters),
  };
}

/** The client's redirect URI, which signing a user in needs. A client made for `client_credentials` alone has none. */
export function requireRedirectUri(options: ResolvedClientOptions, caller: string): string {
  if (options.redirectUri === undefined) {
    throw new TypeError(`${caller}: createClient needs a redirectUri to sign users in`);
  }
  return options.redirectUri;
}

/**
 * The parameters every request sends, in the order OpenID Connect Core §3.1.2.1 lists them. A plain OAuth 2.0
 * client sends no `nonce`, and no `scope` when none was asked for.
 */
function requiredParameters(
  options: ResolvedClientOptions,
  redirectUri: string,
  request: ReadRequest,
  values: { readonly state: string; readonly nonce: string | undefined; readonly codeChallenge: string },
): [string, string][] {
  return [
    ["response_type", RESPONSE_TYPE],
    ["client_id", options.clientId],
    ["redirect_uri", redirectUri],
    ...(request.scope === undefined ? [] : [["scope", request.scope.join(" ")] as [string, string]]),
    ["state", values.state],
    ...(values.nonce === undefined ? [] : [["nonce", values.nonce] as [string, string]]),
    ["code_challenge", values.codeChallenge],
    ["code_challenge_method", CODE_CHALLENGE_METHOD],
  ];
}

/** The parameters a request sends only when the caller set them. */
function optionalParameters(request: ReadRequest): [string, string][] {
  const parameters: [string, string][] = [];
  if (request.responseMode !== "query") {
    parameters.push(["response_mode", request.responseMode]);
  }
  if (request.prompt.length > 0) {
    parameters.push(["prompt", request.prompt.join(" ")]);
  }
  if (request.maxAge !== undefined) {
    parameters.push(["max_age", String(request.maxAge)]);
  }
  if (request.loginHint !== undefined) {
    parameters.push(["login_hint", request.loginHint]);
  }
  if (request.uiLocales.length > 0) {
    parameters.push(["ui_locales", request.uiLocales.join(" ")]);
  }
  for (const resource of request.resource) {
    parameters.push(["resource", resource]);
  }
  const lists: readonly (readonly [string, readonly string[]])[] = [
    ["acr_values", request.acrValues],
    ["claims_locales", request.claimsLocales],
  ];
  for (const [name, list] of lists) {
    if (list.length > 0) {
      parameters.push([name, list.join(" ")]);
    }
  }
  const single: readonly (readonly [string, string | undefined])[] = [
    ["display", request.display],
    ["id_token_hint", request.idTokenHint],
    ["claims", request.claims],
  ];
  for (const [name, value] of single) {
    // An empty hint is left out, as the provider reads an empty parameter as absent (RFC 6749 §3.1).
    if (value !== undefined && value !== "") {
      parameters.push([name, value]);
    }
  }
  for (const [name, value] of request.extraParameters) {
    parameters.push([name, value]);
  }
  return parameters;
}

/**
 * Starts an authorization code flow with PKCE `S256` (RFC 7636), a fresh `state`, and, for an OpenID client, a
 * fresh `nonce`.
 *
 * The URL keeps any query the authorization endpoint already has. `pending` is plain JSON, because the app
 * stores it between the redirect and the callback.
 *
 * @param options - The resolved client options, supplying the endpoint, client, and redirect URI.
 * @param request - What to ask for. Omitted, it requests `openid` alone.
 * @returns The frozen URL and pending state. `pending.maxAge` and `pending.requestedAt` are present only when
 * `maxAge` was requested, and `pending.responseMode` only for `form_post`.
 * @throws {TypeError} When `request` is invalid or has a member that is not an option, or when the URL it makes is
 * longer, or has more parameters, than the provider reads. The message names the option or the limit and never its
 * value or the URL.
 */
export async function buildAuthorization(
  options: ResolvedClientOptions,
  request: AuthorizeOptions = {},
): Promise<AuthorizationStart> {
  if (typeof request !== "object" || request === null) {
    throw new TypeError("authorize: options must be an object");
  }
  const redirectUri = requireRedirectUri(options, "authorize");
  const read = readRequest(request, options);
  const state = randomToken();
  const nonce = options.openid ? randomToken() : undefined;
  const codeVerifier = randomToken();
  const codeChallenge = await computeCodeChallenge(codeVerifier);

  const url = new URL(options.metadata.authorization_endpoint);
  const parameters = [
    ...requiredParameters(options, redirectUri, read, { state, nonce, codeChallenge }),
    ...optionalParameters(read),
  ];
  for (const [name, value] of parameters) {
    url.searchParams.append(name, value);
  }
  // Each value is capped, but percent-encoding can grow them past the provider's URL limit, which would answer
  // with its own error page instead of a redirect.
  if (url.href.length > MAX_URL_LENGTH) {
    throw new TypeError(`authorize: the authorization request URL is longer than ${MAX_URL_LENGTH} characters`);
  }
  // The provider reads at most this many, its endpoint's own query included, and refuses more with its own page.
  if ([...url.searchParams].length > MAX_PARAMETERS) {
    throw new TypeError(`authorize: the authorization request has more than ${MAX_PARAMETERS} parameters`);
  }

  // max_age is measured when the request is made (OpenID Connect Core §3.1.2.1), so the callback needs that time.
  const pending: PendingAuthorization = {
    state,
    ...(nonce === undefined ? {} : { nonce }),
    codeVerifier,
    ...(read.maxAge === undefined
      ? {}
      : { maxAge: read.maxAge, requestedAt: Math.floor(options.now() / MILLISECONDS_PER_SECOND) }),
    ...(read.responseMode === "form_post" ? { responseMode: "form_post" as const } : {}),
  };
  return deepFreeze({ url: url.href, pending });
}
