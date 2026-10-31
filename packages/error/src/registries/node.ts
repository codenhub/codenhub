/**
 * Node.js error preset: network failures from sockets, DNS, `fetch`, and `AbortSignal` mapped to safe feedback.
 *
 * @packageDocumentation
 */

import { freezeFeedbackMap } from "../bucket";
import { createErrorRegistry, freezeRegistry } from "../registry";
import type { ErrorFeedback } from "../types";

/**
 * Raw code mapping definitions for Node.js network failures.
 *
 * Covers the system codes raised by sockets and DNS lookups and the `UND_ERR_*` codes raised by
 * the built-in `fetch`, which carries them on the `cause` of its `TypeError`. Only failures that
 * happen before the request reaches the server are marked retryable; `ETIMEDOUT` is not, because
 * it is also raised on a socket that already carried the request. Filesystem codes are left
 * out: what `ENOENT` should tell a user depends on what the application was doing.
 */
export const nodeErrorCodes = freezeFeedbackMap({
  ECONNREFUSED: {
    message:
      "We couldn't connect to a service this depends on. It may be unavailable for a moment, so try again shortly.",
    messageKey: "error.node.network.connectionRefused",
    source: "node.network",
    isRetryable: true,
  },
  ENOTFOUND: {
    message:
      "We couldn't find the address of a service this depends on. Try again shortly, and contact support if it keeps happening.",
    messageKey: "error.node.network.addressNotFound",
    source: "node.network",
    isRetryable: true,
  },
  UND_ERR_CONNECT_TIMEOUT: {
    message: "A service this depends on took too long to accept the connection. Try again shortly.",
    messageKey: "error.node.network.connectionTimeout",
    source: "node.network",
    isRetryable: true,
  },
  EAI_AGAIN: {
    message: "We couldn't look up the address of a service this depends on just now. Try again shortly.",
    messageKey: "error.node.network.addressLookupFailed",
    source: "node.network",
    isRetryable: true,
  },
  EHOSTUNREACH: {
    message:
      "We couldn't reach a service this depends on. Try again shortly, and contact support if it keeps happening.",
    messageKey: "error.node.network.unreachable",
    source: "node.network",
    isRetryable: true,
  },
  ENETUNREACH: {
    message:
      "We couldn't reach a service this depends on. Try again shortly, and contact support if it keeps happening.",
    messageKey: "error.node.network.unreachable",
    source: "node.network",
    isRetryable: true,
  },
  ECONNRESET: {
    message: "The connection was interrupted before this finished. Check whether it went through before trying again.",
    messageKey: "error.node.network.connectionReset",
    source: "node.network",
  },
  UND_ERR_SOCKET: {
    message: "The connection closed before this finished. Check whether it went through before trying again.",
    messageKey: "error.node.network.connectionClosed",
    source: "node.network",
  },
  EPIPE: {
    message: "The connection closed before this finished. Check whether it went through before trying again.",
    messageKey: "error.node.network.connectionClosed",
    source: "node.network",
  },
  // Not retryable: raised when a connection attempt times out and also on an established socket,
  // after the request was sent. The code alone does not say which.
  ETIMEDOUT: {
    message: "A service this depends on took too long to respond. Check whether this went through before trying again.",
    messageKey: "error.node.network.responseTimeout",
    source: "node.network",
  },
  UND_ERR_HEADERS_TIMEOUT: {
    message: "A service this depends on took too long to respond. Check whether this went through before trying again.",
    messageKey: "error.node.network.responseTimeout",
    source: "node.network",
  },
  UND_ERR_BODY_TIMEOUT: {
    message: "A service this depends on took too long to respond. Check whether this went through before trying again.",
    messageKey: "error.node.network.responseTimeout",
    source: "node.network",
  },
});

/**
 * Raw name mapping definitions for the `DOMException` names an `AbortSignal` raises on Node.js.
 *
 * A `fetch` given `AbortSignal.timeout()` rejects with a `TimeoutError`, and one cancelled through
 * an `AbortController` with an `AbortError`. Neither is retryable: a timeout can fire after the
 * other side received the request. The messages speak about the call this side made, not the
 * reader's connection.
 */
export const nodeErrorNames = freezeFeedbackMap({
  TimeoutError: {
    message: "A service this depends on took too long to respond. Check whether this went through before trying again.",
    messageKey: "error.node.network.responseTimeout",
    source: "node.network",
  },
  AbortError: {
    message: "The request was cancelled before it finished.",
    messageKey: "error.node.abort",
    source: "node",
  },
});

const nodeErrorPatternDefinitions: readonly (readonly [RegExp, ErrorFeedback])[] = [
  [
    // The whole message of a failed built-in fetch. It is reached only when the cause carries
    // no registered code, so the failure is not known to be transient.
    /^fetch failed$/i,
    {
      message:
        "We couldn't complete a request to a service this depends on. Check whether it went through before trying again.",
      messageKey: "error.node.network.requestFailed",
      source: "node.network",
    },
  ] as const,
];

/**
 * Read-only heuristic pattern mappings for Node.js network failures.
 *
 * Identifies a failed built-in `fetch` whose cause carries no registered code.
 */
export const nodeErrorPatterns: readonly (readonly [RegExp, Readonly<ErrorFeedback>])[] = Object.freeze(
  nodeErrorPatternDefinitions.map(([pattern, feedback]) =>
    Object.freeze([Object.freeze(pattern) as RegExp, Object.freeze({ ...feedback })] as const),
  ),
);

const registry = createErrorRegistry();

registry.codes.addList(Object.entries(nodeErrorCodes));
registry.names.addList(Object.entries(nodeErrorNames));
registry.patterns.addList(nodeErrorPatterns);

/**
 * An opt-in, read-only error registry pre-populated with mappings for Node.js network failures.
 *
 * Includes code mappings for socket, DNS, and built-in `fetch` failures (e.g., `ECONNREFUSED`,
 * `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT`), name mappings for the `TimeoutError` and `AbortError` an
 * `AbortSignal` raises, and a pattern mapping for a failed `fetch` with no recognized cause.
 *
 * Importing this preset does not access Node.js globals or built-in modules.
 */
export const nodeErrorRegistry = freezeRegistry(registry);
