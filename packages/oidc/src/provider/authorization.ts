import { readBody } from "../shared/body";
import { digestKey, randomToken } from "../shared/encoding";
import { MAX_BODY_BYTES, MAX_URL_LENGTH } from "../shared/limits";
import { parseParameters } from "../shared/parameters";
import { isCodeChallenge } from "../shared/pkce";
import { fail, failWith, ok } from "../shared/result";
import type { OAuthErrorCode, OidcErr, OidcIssue, OidcPathSegment, OidcResult, Prompt } from "../shared/types";
import { checkClientRecord } from "./client-record";
import type { ResolvedOptions } from "./options";
import { redirectResponse } from "./responses";
import type {
  AuthorizationDenial,
  AuthorizationFailure,
  AuthorizationGrant,
  AuthorizationInteraction,
  ClientRecord,
  CodeRecord,
  InteractionRecord,
} from "./types";

type ParameterMap = ReadonlyMap<string, string>;

/** A failure answered by a redirect to the client's verified redirect URI. */
type Failure = OidcErr<AuthorizationFailure>;

/** A check that either passes with a value or fails with the response to send. */
type Checked<T> = { readonly ok: true; readonly value: T } | Failure;

/** Where a redirect goes, and what it carries besides the response parameters. */
interface RedirectTarget {
  readonly uri: string;
  readonly state: string | undefined;
  readonly issuer: string;
}

/** A request that passed every check, ready to be saved as an interaction. */
interface ValidatedRequest {
  readonly clientId: string;
  readonly target: RedirectTarget;
  readonly scopes: readonly string[];
  readonly codeChallenge: string;
  readonly prompt: readonly Prompt[];
  readonly maxAge: number | undefined;
  readonly nonce: string | undefined;
  readonly loginHint: string | undefined;
  readonly uiLocales: readonly string[] | undefined;
}

/** What the checks after client verification read from. */
interface RequestContext {
  readonly options: ResolvedOptions;
  readonly client: ClientRecord;
  readonly parameters: ParameterMap;
  readonly target: RedirectTarget;
}

const FORM_MEDIA_TYPE = "application/x-www-form-urlencoded";
const MAX_AGE_PATTERN = /^\d{1,9}$/;
const PROMPTS: readonly Prompt[] = ["none", "login", "consent", "select_account"];
const DENIAL_ERRORS = new Set<unknown>([
  "access_denied",
  "login_required",
  "consent_required",
  "interaction_required",
  "account_selection_required",
]);

/** Parameters this provider refuses because it does not implement the mechanism they carry (OpenID Connect Core §6, §7). */
const UNSUPPORTED_PARAMETERS: readonly (readonly [string, OAuthErrorCode])[] = [
  ["request", "request_not_supported"],
  ["request_uri", "request_uri_not_supported"],
  ["registration", "registration_not_supported"],
];

/**
 * Validates an authorization request and saves it as an interaction for the app's login and consent pages.
 *
 * @remarks
 * A failure whose `redirect` is `null` could not verify the client or its redirect URI, so the app renders
 * its own error page. Every other failure is answered with a redirect to that verified URI.
 */
export async function beginAuthorization(
  options: ResolvedOptions,
  request: Request,
): Promise<OidcResult<AuthorizationInteraction, AuthorizationFailure>> {
  if (request.url.length > MAX_URL_LENGTH) {
    return renderError(issueOf("invalid_request"));
  }
  const parameters = await readParameters(request);
  if (!parameters.ok) {
    return parameters;
  }
  const client = await lookupClient(options, parameters.value);
  if (!client.ok) {
    return client;
  }
  const redirectUri = checkRedirectUri(client.value, parameters.value);
  if (!redirectUri.ok) {
    return redirectUri;
  }
  const target: RedirectTarget = {
    uri: redirectUri.value,
    state: parameters.value.get("state"),
    issuer: options.issuer,
  };
  const checked = checkRequest({ options, client: client.value, parameters: parameters.value, target });
  if (!checked.ok) {
    return checked;
  }
  return saveInteraction(options, checked.value);
}

/**
 * Finishes an interaction by issuing a code, or by sending the denial, as a redirect to the client.
 *
 * @remarks
 * Throws `TypeError` only for an `outcome` the app built wrongly. The interaction is consumed before the
 * grant is checked, so such a call also ends the interaction.
 */
export async function completeAuthorization(
  options: ResolvedOptions,
  interactionId: unknown,
  outcome: AuthorizationGrant | AuthorizationDenial,
): Promise<OidcResult<Response>> {
  assertOutcomeShape(outcome);
  const interaction = await consumeLiveInteraction(options, interactionId);
  if (!interaction.ok) {
    return interaction;
  }
  const target = targetOf(options, interaction.value);
  if ("error" in outcome) {
    return ok(respond(target, { error: outcome.error }));
  }
  assertGrantFits(interaction.value, outcome, options.now());
  const code = await issueCode(options, interaction.value, outcome);
  return ok(respond(target, { code }));
}

/** Builds an issue, adding `path` only when one is given so an absent member stays absent. */
const issueOf = (code: OidcIssue["code"], path?: readonly OidcPathSegment[]): OidcIssue =>
  path === undefined ? { code } : { code, path };

/** Keeps an optional member absent, rather than `undefined`, when its value is absent. */
const optionalMember = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isPrompt = (value: string): value is Prompt => (PROMPTS as readonly string[]).includes(value);

/** The response for a request the app must render itself, because nothing it names can be trusted. */
function renderError(issue: OidcIssue): Failure {
  return failWith<AuthorizationFailure>({ issues: [issue], redirect: null });
}

/** The redirect for a request that failed after the client and redirect URI were verified. */
function redirectFailure(target: RedirectTarget, code: OAuthErrorCode, path?: readonly OidcPathSegment[]): Failure {
  return failWith<AuthorizationFailure>({
    issues: [issueOf(code, path)],
    redirect: respond(target, { error: code }),
  });
}

/** A redirect to the verified URI carrying `parameters`, with the state the client sent and this issuer (RFC 9207). */
function respond(target: RedirectTarget, parameters: Readonly<Record<string, string>>): Response {
  return redirectResponse(target.uri, { ...parameters, state: target.state, iss: target.issuer });
}

function targetOf(options: ResolvedOptions, interaction: InteractionRecord): RedirectTarget {
  return { uri: interaction.redirectUri, state: interaction.state, issuer: options.issuer };
}

/** Reads the parameters from the query for GET or from the form body for POST, refusing anything else. */
async function readParameters(request: Request): Promise<Checked<ParameterMap>> {
  const text = await readRequestText(request);
  if (text === undefined) {
    return renderError(issueOf("invalid_request"));
  }
  const parsed = parseParameters(text);
  if (!parsed.ok) {
    return renderError({ code: "invalid_request", params: { reason: parsed.reason } });
  }
  return { ok: true, value: parsed.parameters };
}

/**
 * The raw query or form text, or `undefined` for a method or body this endpoint refuses.
 *
 * POST reads the body alone: parameters in the URL of a POST are not part of the request this endpoint answers.
 */
async function readRequestText(request: Request): Promise<string | undefined> {
  if (request.method === "GET") {
    return new URL(request.url).search.slice(1);
  }
  if (request.method !== "POST" || !isFormContentType(request.headers.get("content-type"))) {
    return undefined;
  }
  const body = await readBody(request, MAX_BODY_BYTES);
  return body.ok ? body.text : undefined;
}

/** Tests for the form media type, ignoring its parameters and letter case. */
function isFormContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }
  const [mediaType = ""] = contentType.split(";");
  return mediaType.trim().toLowerCase() === FORM_MEDIA_TYPE;
}

/**
 * Finds the client the request names, and checks its record.
 *
 * Results are returned as plain objects rather than through `ok`, because `ok` deep-freezes its value and
 * that would freeze the app's own client record.
 */
async function lookupClient(options: ResolvedOptions, parameters: ParameterMap): Promise<Checked<ClientRecord>> {
  const clientId = parameters.get("client_id");
  if (clientId === undefined) {
    return renderError(issueOf("invalid_request", ["client_id"]));
  }
  const record = await options.store.findClient(clientId);
  if (record === undefined) {
    return renderError(issueOf("unknown_client"));
  }
  return { ok: true, value: checkClientRecord(record, clientId) };
}

/** The redirect URI must match a registered one byte for byte: normalizing it would let a near miss through. */
function checkRedirectUri(client: ClientRecord, parameters: ParameterMap): Checked<string> {
  const redirectUri = parameters.get("redirect_uri");
  if (redirectUri === undefined || !client.redirectUris.includes(redirectUri)) {
    return renderError(issueOf("invalid_redirect_uri"));
  }
  return { ok: true, value: redirectUri };
}

/** Runs the request checks in the order the spec gives, so the first failure found is the one reported. */
function checkRequest(context: RequestContext): Checked<ValidatedRequest> {
  const failure =
    findUnsupportedParameter(context) ?? findResponseTypeFailure(context) ?? findResponseModeFailure(context);
  if (failure !== undefined) {
    return failure;
  }
  const scopes = readScopes(context);
  if (!scopes.ok) {
    return scopes;
  }
  const codeChallenge = readCodeChallenge(context);
  if (!codeChallenge.ok) {
    return codeChallenge;
  }
  const prompt = readPrompt(context);
  if (!prompt.ok) {
    return prompt;
  }
  const maxAge = readMaxAge(context);
  if (!maxAge.ok) {
    return maxAge;
  }
  const { parameters } = context;
  return {
    ok: true,
    value: {
      clientId: context.client.clientId,
      target: context.target,
      scopes: scopes.value,
      codeChallenge: codeChallenge.value,
      prompt: prompt.value,
      maxAge: maxAge.value,
      nonce: parameters.get("nonce"),
      loginHint: parameters.get("login_hint"),
      uiLocales: readUiLocales(parameters),
    },
  };
}

function findUnsupportedParameter({ parameters, target }: RequestContext): Failure | undefined {
  const unsupported = UNSUPPORTED_PARAMETERS.find(([name]) => parameters.has(name));
  return unsupported === undefined ? undefined : redirectFailure(target, unsupported[1]);
}

function findResponseTypeFailure({ parameters, target }: RequestContext): Failure | undefined {
  const responseType = parameters.get("response_type");
  if (responseType === undefined) {
    return redirectFailure(target, "invalid_request", ["response_type"]);
  }
  // Only the code flow is offered: implicit and hybrid flows would send tokens through the browser.
  return responseType === "code" ? undefined : redirectFailure(target, "unsupported_response_type");
}

function findResponseModeFailure({ parameters, target }: RequestContext): Failure | undefined {
  const responseMode = parameters.get("response_mode");
  return responseMode === undefined || responseMode === "query"
    ? undefined
    : redirectFailure(target, "invalid_request", ["response_mode"]);
}

/** Scopes split on single spaces, each one allowed by the provider and the client, with `openid` required. */
function readScopes({ options, client, parameters, target }: RequestContext): Checked<readonly string[]> {
  const requested = parameters.get("scope")?.split(" ") ?? [];
  const isAllowed = (scope: string): boolean =>
    scope !== "" && options.scopeClaims.has(scope) && client.scopes.includes(scope);
  if (!requested.includes("openid") || !requested.every(isAllowed)) {
    return redirectFailure(target, "invalid_scope");
  }
  return { ok: true, value: [...new Set(requested)] };
}

/**
 * The PKCE challenge, which must be S256. `plain` is refused because RFC 7636 makes it the default when the
 * method is missing, and an attacker who can read the challenge could then replay it.
 */
function readCodeChallenge({ parameters, target }: RequestContext): Checked<string> {
  const challenge = parameters.get("code_challenge");
  if (!isCodeChallenge(challenge)) {
    return redirectFailure(target, "invalid_request", ["code_challenge"]);
  }
  if (parameters.get("code_challenge_method") !== "S256") {
    return redirectFailure(target, "invalid_request", ["code_challenge_method"]);
  }
  return { ok: true, value: challenge };
}

/** Prompt values split on single spaces; `none` must stand alone, since it forbids any interaction. */
function readPrompt({ parameters, target }: RequestContext): Checked<readonly Prompt[]> {
  const requested = parameters.get("prompt");
  if (requested === undefined) {
    return { ok: true, value: [] };
  }
  const values = [...new Set(requested.split(" "))];
  const prompts = values.filter(isPrompt);
  if (prompts.length !== values.length || (prompts.includes("none") && prompts.length > 1)) {
    return redirectFailure(target, "invalid_request", ["prompt"]);
  }
  return { ok: true, value: prompts };
}

function readMaxAge({ parameters, target }: RequestContext): Checked<number | undefined> {
  const requested = parameters.get("max_age");
  if (requested === undefined) {
    return { ok: true, value: undefined };
  }
  // Digits only: a sign, a decimal point, or whitespace would make `Number` accept what the spec does not.
  if (!MAX_AGE_PATTERN.test(requested)) {
    return redirectFailure(target, "invalid_request", ["max_age"]);
  }
  return { ok: true, value: Number(requested) };
}

function readUiLocales(parameters: ParameterMap): readonly string[] | undefined {
  const requested = parameters.get("ui_locales");
  return requested === undefined ? undefined : requested.split(" ");
}

/** Saves the validated request under the digest of a new interaction id, and returns the id to the app. */
async function saveInteraction(
  options: ResolvedOptions,
  request: ValidatedRequest,
): Promise<OidcResult<AuthorizationInteraction, AuthorizationFailure>> {
  const createdAt = options.now();
  const record: InteractionRecord = {
    clientId: request.clientId,
    redirectUri: request.target.uri,
    scopes: request.scopes,
    codeChallenge: request.codeChallenge,
    prompt: request.prompt,
    createdAt,
    expiresAt: createdAt + options.ttl.interaction,
    ...optionalMember("state", request.target.state),
    ...optionalMember("nonce", request.nonce),
    ...optionalMember("maxAge", request.maxAge),
    ...optionalMember("loginHint", request.loginHint),
    ...optionalMember("uiLocales", request.uiLocales),
  };
  // The id is a bearer secret for the app's session, so the store only ever sees its digest.
  const id = randomToken();
  await options.store.saveInteraction(await digestKey(id), record);
  return ok({
    id,
    clientId: request.clientId,
    redirectUri: request.target.uri,
    scopes: request.scopes,
    prompt: request.prompt,
    createdAt,
    ...optionalMember("maxAge", request.maxAge),
    ...optionalMember("loginHint", request.loginHint),
    ...optionalMember("uiLocales", request.uiLocales),
  });
}

/** Throws `TypeError` for an outcome of the wrong shape, naming the member and never its value. */
function assertOutcomeShape(outcome: unknown): asserts outcome is AuthorizationGrant | AuthorizationDenial {
  if (!isRecord(outcome)) {
    throw new TypeError("completeAuthorization: outcome must be an object");
  }
  if ("error" in outcome) {
    if (!DENIAL_ERRORS.has(outcome.error) || Object.keys(outcome).length !== 1) {
      throw new TypeError("completeAuthorization: outcome.error must be a denial with no other members");
    }
    return;
  }
  if (typeof outcome.subject !== "string" || outcome.subject === "") {
    throw new TypeError("completeAuthorization: outcome.subject must be a non-empty string");
  }
  if (!isNonNegativeInteger(outcome.authTime)) {
    throw new TypeError("completeAuthorization: outcome.authTime must be a non-negative integer");
  }
  if (!isStringArray(outcome.scopes)) {
    throw new TypeError("completeAuthorization: outcome.scopes must be an array of strings");
  }
  if (outcome.amr !== undefined && !isStringArray(outcome.amr)) {
    throw new TypeError("completeAuthorization: outcome.amr must be an array of strings");
  }
  if (outcome.acr !== undefined && typeof outcome.acr !== "string") {
    throw new TypeError("completeAuthorization: outcome.acr must be a string");
  }
}

/**
 * Atomically takes the interaction, or reports it missing: unknown, already completed, or expired.
 *
 * An empty or non-string id is answered the same way, so the caller learns nothing about which check failed.
 */
async function consumeLiveInteraction(
  options: ResolvedOptions,
  interactionId: unknown,
): Promise<OidcResult<InteractionRecord>> {
  if (typeof interactionId !== "string" || interactionId === "") {
    return fail({ code: "interaction_not_found" });
  }
  const record = await options.store.consumeInteraction(await digestKey(interactionId));
  if (record === undefined || record.expiresAt <= options.now()) {
    return fail({ code: "interaction_not_found" });
  }
  return { ok: true, value: record };
}

/** Throws `TypeError` when the app grants more than the request asked for, or authenticates too early. */
function assertGrantFits(interaction: InteractionRecord, grant: AuthorizationGrant, now: number): void {
  if (!grant.scopes.every((scope) => interaction.scopes.includes(scope))) {
    throw new TypeError("completeAuthorization: outcome.scopes must be a subset of the requested scopes");
  }
  if (!grant.scopes.includes("openid")) {
    throw new TypeError("completeAuthorization: outcome.scopes must include openid");
  }
  if (grant.authTime > now) {
    throw new TypeError("completeAuthorization: outcome.authTime must not be in the future");
  }
  // prompt=login means the user must authenticate again for this request, so an older login does not count.
  if (interaction.prompt.includes("login") && grant.authTime < interaction.createdAt) {
    throw new TypeError("completeAuthorization: outcome.authTime must not precede the request under prompt=login");
  }
  if (interaction.maxAge !== undefined && now - grant.authTime > interaction.maxAge) {
    throw new TypeError("completeAuthorization: outcome.authTime must be within the requested max_age");
  }
}

/** Saves a single-use code for the grant, under its digest, and returns the code to send. */
async function issueCode(
  options: ResolvedOptions,
  interaction: InteractionRecord,
  grant: AuthorizationGrant,
): Promise<string> {
  const code = randomToken();
  const record: CodeRecord = {
    grantId: randomToken(),
    clientId: interaction.clientId,
    redirectUri: interaction.redirectUri,
    codeChallenge: interaction.codeChallenge,
    ...optionalMember("nonce", interaction.nonce),
    scopes: [...new Set(grant.scopes)],
    subject: grant.subject,
    authTime: grant.authTime,
    ...optionalMember("amr", grant.amr),
    ...optionalMember("acr", grant.acr),
    maxAgeRequested: interaction.maxAge !== undefined,
    expiresAt: options.now() + options.ttl.code,
  };
  await options.store.saveCode(await digestKey(code), record);
  return code;
}
