import { randomToken } from "../shared/encoding";
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

const isLanguageTag = (value: unknown): boolean => typeof value === "string" && LANGUAGE_TAG.test(value);

/**
 * Checks the scope list, de-duplicates it, and requires `openid`. A missing list defaults to `openid`.
 * The check is on the list itself, not what it becomes, so a provider never gets a scope it did not ask for.
 */
function readScope(scope: readonly string[] | undefined): readonly string[] {
  if (scope === undefined) {
    return DEFAULT_SCOPE;
  }
  if (!Array.isArray(scope) || scope.length === 0 || !scope.every(isScopeToken)) {
    throw new TypeError("authorize: scope must be a non-empty array of scope tokens");
  }
  if (!scope.includes(REQUIRED_SCOPE)) {
    throw new TypeError("authorize: scope must include openid");
  }
  return [...new Set(scope)];
}

/**
 * Checks the prompt values. `none` asks the provider to show no UI, so it cannot share the request with a
 * value that asks for UI; OpenID Connect Core §3.1.2.1 forbids the pair.
 */
function readPrompt(prompt: readonly Prompt[] | undefined): readonly Prompt[] {
  if (prompt === undefined) {
    return [];
  }
  if (!Array.isArray(prompt) || !prompt.every(isPrompt)) {
    throw new TypeError("authorize: prompt must be an array of none, login, consent, or select_account");
  }
  if (new Set(prompt).size !== prompt.length) {
    throw new TypeError("authorize: prompt must not repeat a value");
  }
  if (prompt.includes("none") && prompt.length > 1) {
    throw new TypeError("authorize: prompt none cannot be combined with another value");
  }
  return prompt;
}

function readMaxAge(maxAge: number | undefined): number | undefined {
  if (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 0)) {
    throw new TypeError("authorize: maxAge must be a non-negative integer");
  }
  return maxAge;
}

function readLoginHint(loginHint: string | undefined): string | undefined {
  if (loginHint !== undefined && typeof loginHint !== "string") {
    throw new TypeError("authorize: loginHint must be a string");
  }
  return loginHint;
}

function readUiLocales(uiLocales: readonly string[] | undefined): readonly string[] {
  if (uiLocales === undefined) {
    return [];
  }
  if (!Array.isArray(uiLocales) || !uiLocales.every(isLanguageTag)) {
    throw new TypeError("authorize: uiLocales must be an array of non-empty language tags without spaces");
  }
  return uiLocales;
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
 * @throws {TypeError} When `request` is invalid. The message names the option and never its value.
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

  const pending: PendingAuthorization =
    read.maxAge === undefined ? { state, nonce, codeVerifier } : { state, nonce, codeVerifier, maxAge: read.maxAge };
  return deepFreeze({ url: url.href, pending });
}
