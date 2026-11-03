/**
 * HTTP error preset: the client and server error statuses a response can carry, mapped to safe feedback.
 *
 * @packageDocumentation
 */

import { freezeFeedbackMap } from "../bucket";
import { createErrorRegistry, freezeRegistry } from "../registry";
import { DEVELOPER_FAULT_MESSAGE } from "./messages";

/**
 * Raw code mapping definitions for HTTP response statuses, keyed by the status as text.
 *
 * Nothing is retryable: a status is the server's answer, so the request reached it, and even a
 * `503` or `504` can follow a request the server or a service behind it already acted on. A `429`
 * needs a wait the flag cannot express.
 */
export const httpErrorCodes = freezeFeedbackMap({
  "400": {
    message: "We couldn't process this request. Check what you entered and try again.",
    messageKey: "error.http.badRequest",
    source: "http",
  },
  "401": {
    message: "You need to sign in to continue.",
    messageKey: "error.http.unauthorized",
    source: "http",
  },
  "403": {
    message: "You don't have permission to do this.",
    messageKey: "error.http.forbidden",
    source: "http",
  },
  "404": {
    message: "We couldn't find what you were looking for.",
    messageKey: "error.http.notFound",
    source: "http",
  },
  "409": {
    message: "This conflicts with a change made elsewhere. Refresh the page, then try again.",
    messageKey: "error.http.conflict",
    source: "http",
  },
  "413": {
    message: "This is too large to send. Try a smaller file or less content.",
    messageKey: "error.http.payloadTooLarge",
    source: "http",
  },
  "422": {
    message: "Some of what you entered isn't valid. Check it and try again.",
    messageKey: "error.http.unprocessable",
    source: "http",
  },
  "429": {
    message: "Too many requests. Wait a minute, then try again.",
    messageKey: "error.http.rateLimited",
    source: "http",
  },
  "500": {
    message: DEVELOPER_FAULT_MESSAGE,
    messageKey: "error.http.serverError",
    source: "http",
  },
  "502": {
    message: "A service this depends on isn't responding. Check whether this went through before trying again.",
    messageKey: "error.http.badGateway",
    source: "http",
  },
  "503": {
    message: "This service is unavailable right now. Try again in a few minutes.",
    messageKey: "error.http.unavailable",
    source: "http",
  },
  "504": {
    message: "A service this depends on took too long to respond. Check whether this went through before trying again.",
    messageKey: "error.http.gatewayTimeout",
    source: "http",
  },
});

const registry = createErrorRegistry();

registry.codes.addList(Object.entries(httpErrorCodes));

/**
 * An opt-in, read-only error registry pre-populated with mappings for HTTP error statuses.
 *
 * Pass it as the `registry` option when classifying a failed response, as in
 * `err({ code: response.status }, { registry: httpErrorRegistry })`, rather than merging it into the
 * global registry: a status is a short number that only means something for a response, and could
 * collide with another service's codes.
 */
export const httpErrorRegistry = freezeRegistry(registry);
