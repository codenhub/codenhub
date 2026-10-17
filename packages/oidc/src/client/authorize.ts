import { randomToken } from "../shared/encoding";
import { MAX_PARAMETER_LENGTH, MAX_URL_LENGTH } from "../shared/limits";
import { computeCodeChallenge } from "../shared/pkce";
import { deepFreeze } from "../shared/result";
import type { Prompt } from "../shared/types";
import type { ResolvedClientOptions } from "./options";
import type { AuthorizationStart, AuthorizeOptions, PendingAuthorization } from "./types";

const REQUIRED_SCOPE = "openid";
const DEFAULT_SCOPE: readonly string[] = [REQUIRED_SCOPE];
/** RFC 6749 §3.3: printable ASCII except space, `"` and `\`. */
const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
const PROMPT_VALUES: ReadonlySet<string> = new Set<string>(["none", "login", "consent", "select_account"]);
/** A BCP 47 tag has no spaces; a space would split one value into two in the space-joined parameter. */
const LANGUAGE_TAG = /^\S+$/;
/** The provider reads max_age only as one to nine digits, so a larger value would be refused after the redirect. */
const MAX_AGE_LIMIT = 999999999;
const RESPONSE_TYPE = "code";
const CODE_CHALLENGE_METHOD = "S256";

/** The validated, normalized request. Every field is ready to send. */
interface ReadRequest {
  readonly scope: readonly string[];
  readonly prompt: readonly Prompt[];
  readonly maxAge: number | undefined;
  readonly loginHint: string | undefined;
  readonly uiLocales: readonly string[];
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
 * Checks the scope list, de-duplicates it, and requires `openid`. A missing list defaults to `openid`.
 * The check is on the list itself, not what it becomes, so a provider never gets a scope it did not ask for.
 */
function readScope(scope: readonly string[] | undefined): readonly string[] {
  if (scope === undefined) {
    return DEFAULT_SCOPE;
  }
  const copy = denseCopy(scope);
  if (copy === undefined || copy.length === 0 || !copy.every(isScopeToken)) {
    throw new TypeError("authorize: scope must be a non-empty array of at most 100 scope tokens");
  }
  if (!copy.includes(REQUIRED_SCOPE)) {
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
      "authorize: prompt must be an array of none, login, consent, or select_account, of at most 100 entries",
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

function readLoginHint(loginHint: string | undefined): string | undefined {
  if (loginHint !== undefined && typeof loginHint !== "string") {
    throw new TypeError("authorize: loginHint must be a string");
  }
  // A lone surrogate would be sent as U+FFFD, so the provider would see a different hint than the caller gave.
  if (loginHint !== undefined && !loginHint.isWellFormed()) {
    throw new TypeError("authorize: loginHint must be a string of well-formed Unicode");
  }
  if (loginHint !== undefined && loginHint.length > MAX_PARAMETER_LENGTH) {
    throw new TypeError("authorize: loginHint is longer than the provider accepts");
  }
  return loginHint;
}

function readUiLocales(uiLocales: readonly string[] | undefined): readonly string[] {
  if (uiLocales === undefined) {
    return [];
  }
  const copy = denseCopy(uiLocales);
  if (copy === undefined || !copy.every(isLanguageTag)) {
    throw new TypeError(
      "authorize: uiLocales must be an array of at most 100 non-empty, well-formed language tags without spaces",
    );
  }
  const joined = (copy as string[]).join(" ");
  if (joined.length > MAX_PARAMETER_LENGTH) {
    throw new TypeError("authorize: uiLocales is longer than the provider accepts");
  }
  return copy as string[];
}

/** Validates the whole request before anything is generated, so a refused request has no side effects. */
function readRequest(request: AuthorizeOptions): ReadRequest {
  return {
    scope: readScope(request.scope),
    prompt: readPrompt(request.prompt),
    maxAge: readMaxAge(request.maxAge),
    loginHint: readLoginHint(request.loginHint),
    uiLocales: readUiLocales(request.uiLocales),
  };
}

/** The parameters every request sends, in the order OpenID Connect Core §3.1.2.1 lists them. */
function requiredParameters(
  options: ResolvedClientOptions,
  request: ReadRequest,
  values: { readonly state: string; readonly nonce: string; readonly codeChallenge: string },
): [string, string][] {
  return [
    ["response_type", RESPONSE_TYPE],
    ["client_id", options.clientId],
    ["redirect_uri", options.redirectUri],
    ["scope", request.scope.join(" ")],
    ["state", values.state],
    ["nonce", values.nonce],
    ["code_challenge", values.codeChallenge],
    ["code_challenge_method", CODE_CHALLENGE_METHOD],
  ];
}

/** The parameters a request sends only when the caller set them. */
function optionalParameters(request: ReadRequest): [string, string][] {
  const parameters: [string, string][] = [];
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
  return parameters;
}

/**
 * Starts an authorization code flow with PKCE `S256` (RFC 7636), a fresh `state`, and a fresh `nonce`.
 *
 * The URL keeps any query the authorization endpoint already has. `pending` is plain JSON, because the app
 * stores it between the redirect and the callback.
 *
 * @param options - The resolved client options, supplying the endpoint, client, and redirect URI.
 * @param request - What to ask for. Omitted, it requests `openid` alone.
 * @returns The frozen URL and pending state. `pending.maxAge` is present only when `maxAge` was requested.
 * @throws {TypeError} When `request` is invalid, or when the URL it makes is longer than the provider reads. The
 * message names the option or the limit and never its value or the URL.
 */
export async function buildAuthorization(
  options: ResolvedClientOptions,
  request: AuthorizeOptions = {},
): Promise<AuthorizationStart> {
  if (typeof request !== "object" || request === null) {
    throw new TypeError("authorize: options must be an object");
  }
  const read = readRequest(request);
  const state = randomToken();
  const nonce = randomToken();
  const codeVerifier = randomToken();
  const codeChallenge = await computeCodeChallenge(codeVerifier);

  const url = new URL(options.metadata.authorization_endpoint);
  const parameters = [
    ...requiredParameters(options, read, { state, nonce, codeChallenge }),
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

  const pending: PendingAuthorization =
    read.maxAge === undefined ? { state, nonce, codeVerifier } : { state, nonce, codeVerifier, maxAge: read.maxAge };
  return deepFreeze({ url: url.href, pending });
}
