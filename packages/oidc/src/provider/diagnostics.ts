import type { ProviderDiagnostic, ProviderDiagnosticReason } from "./types";

/** Why a refusal was sent, attached to the response that carries it. */
interface Refusal {
  readonly reason: ProviderDiagnosticReason;
  readonly clientId?: string;
}

/*
 * Each refusal is recorded against its own Response object, so the code that builds a refusal names its
 * reason in place, and `handle` reports it once the endpoint has answered, without the reason travelling
 * through every return type. The map never holds a response past its life.
 */
const refusals = new WeakMap<Response, Refusal>();

/**
 * Records why `response` refuses a request, for {@link reportRefusal}.
 *
 * @param response - The error response to send.
 * @param reason - Why, from the fixed vocabulary.
 * @param clientId - The client, only when it comes from the store or an authenticated request.
 * @returns `response`, unchanged.
 */
export function refuse(response: Response, reason: ProviderDiagnosticReason, clientId?: string): Response {
  refusals.set(response, clientId === undefined ? { reason } : { reason, clientId });
  return response;
}

/**
 * Passes the refusal recorded for `response`, if any, to the app's `onDiagnostic` callback.
 *
 * @param onDiagnostic - The app's callback, when it set one.
 * @param endpoint - The endpoint that answered.
 * @param response - Its response.
 * @returns `response`, unchanged.
 */
export function reportRefusal(
  onDiagnostic: ((diagnostic: ProviderDiagnostic) => void) | undefined,
  endpoint: ProviderDiagnostic["endpoint"],
  response: Response,
): Response {
  const refusal = refusals.get(response);
  if (onDiagnostic !== undefined && refusal !== undefined) {
    onDiagnostic(Object.freeze({ endpoint, status: response.status, ...refusal }));
  }
  return response;
}
