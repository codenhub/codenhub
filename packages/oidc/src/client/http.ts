import { ignoreRejection, readStreamUpTo } from "../shared/body";
import { MAX_RESPONSE_BYTES } from "../shared/limits";
import { fail, ok } from "../shared/result";
import type { OAuthErrorCode, OidcResult } from "../shared/types";

/** Which provider endpoint a request went to, as `params.endpoint` of its issues. */
export type Endpoint = "discovery" | "token" | "userinfo";

/** Why a request failed, as `params.reason` of a `request_failed` issue. */
type RequestFailureReason = "timeout" | "network" | "status" | "too_large" | "content_type" | "malformed";

/** One request to a provider endpoint. */
export interface JsonRequest {
  readonly endpoint: Endpoint;
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
  /** A form body, sent as `application/x-www-form-urlencoded`. */
  readonly form?: URLSearchParams;
  readonly fetch: typeof fetch | undefined;
  readonly timeoutMs: number;
}

/** A JSON object response, of any status. */
export interface JsonResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

const HTTP_OK = 200;

/** A failure raised by the timer, so the race can tell it from a fetch that rejected. */
class RequestRejection extends Error {
  constructor(readonly result: OidcResult<never>) {
    super("request rejected");
  }
}

const OAUTH_ERROR_CODES: ReadonlySet<string> = new Set<OAuthErrorCode>([
  "invalid_request",
  "unauthorized_client",
  "access_denied",
  "unsupported_response_type",
  "invalid_scope",
  "server_error",
  "temporarily_unavailable",
  "invalid_client",
  "invalid_grant",
  "unsupported_grant_type",
  "invalid_token",
  "insufficient_scope",
  "interaction_required",
  "login_required",
  "account_selection_required",
  "consent_required",
  "invalid_request_uri",
  "invalid_request_object",
  "request_not_supported",
  "request_uri_not_supported",
  "registration_not_supported",
]);

/**
 * Narrows an `error` value a provider sent to a known OAuth code. Anything else becomes `unknown`, so an
 * issue never carries text the provider chose.
 */
export const readErrorCode = (value: unknown): OAuthErrorCode | "unknown" =>
  typeof value === "string" && OAUTH_ERROR_CODES.has(value) ? (value as OAuthErrorCode) : "unknown";

/** A `request_failed` result. */
export const requestFailure = (endpoint: Endpoint, reason: RequestFailureReason, status?: number): OidcResult<never> =>
  fail({ code: "request_failed", params: status === undefined ? { endpoint, reason } : { endpoint, reason, status } });

/**
 * Sends a request and reads a JSON object response, within a time and size bound. Redirects are not
 * followed: a provider endpoint that redirects is misconfigured or compromised, and following it would
 * send credentials to whoever controls the target.
 *
 * @returns The status and the parsed object, whatever the status, when the response is JSON; otherwise
 * `request_failed` with a `reason`. Never throws.
 */
export async function requestJson(request: JsonRequest): Promise<OidcResult<JsonResponse>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestRejection(requestFailure(request.endpoint, "timeout")));
    }, request.timeoutMs);
  });
  const sent = send(request, controller.signal);
  // After a timeout the request may still reject; that outcome is no longer wanted.
  void ignoreRejection(sent);
  try {
    return await Promise.race([sent, timedOut]);
  } catch (error) {
    if (error instanceof RequestRejection) {
      return error.result;
    }
    return requestFailure(request.endpoint, controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
}

async function send(request: JsonRequest, signal: AbortSignal): Promise<OidcResult<JsonResponse>> {
  const headers: Record<string, string> = { accept: "application/json", ...request.headers };
  if (request.form !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
  }
  // Called through a local so that a host `fetch`, such as a browser's, never runs with another `this`.
  const fetchFunction = request.fetch ?? globalThis.fetch;
  const response = await fetchFunction(request.url, {
    method: request.method,
    headers,
    body: request.form?.toString(),
    redirect: "manual",
    signal,
  });
  const { endpoint } = request;
  const isJson = /^application\/json\s*(;|$)/i.test(response.headers.get("content-type") ?? "");
  if (!isJson) {
    discardBody(response);
    return response.status === HTTP_OK
      ? requestFailure(endpoint, "content_type")
      : requestFailure(endpoint, "status", response.status);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? Number.NaN);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    discardBody(response);
    return requestFailure(endpoint, "too_large");
  }
  const bytes =
    response.body === null
      ? await readWholeBody(response, MAX_RESPONSE_BYTES)
      : await readStreamUpTo(response.body, MAX_RESPONSE_BYTES);
  if (bytes === undefined) {
    return requestFailure(endpoint, "too_large");
  }
  const body = parseObject(bytes);
  return body === undefined ? requestFailure(endpoint, "malformed") : ok({ status: response.status, body });
}

/**
 * Parses strict UTF-8 JSON whose top level is an object. A leading byte order mark is dropped, as RFC 8259
 * section 8.1 allows. `undefined` for anything else.
 */
function parseObject(bytes: Uint8Array): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** A body with no stream has no chunk to stop at, so its whole buffer is checked against the limit at once. */
async function readWholeBody(response: Response, maxBytes: number): Promise<Uint8Array | undefined> {
  const whole = new Uint8Array(await response.arrayBuffer());
  return whole.byteLength > maxBytes ? undefined : whole;
}

/** Releases a body that will not be read, so the connection can be reused. */
function discardBody(response: Response): void {
  try {
    if (response.body !== null) {
      void ignoreRejection(response.body.cancel());
    }
  } catch {
    // A body that cannot be cancelled, such as a locked one, is left to the garbage collector.
  }
}
