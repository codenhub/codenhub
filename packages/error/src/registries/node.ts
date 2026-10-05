/**
 * Node.js error preset: network failure codes from sockets, DNS, and `fetch` mapped to safe feedback.
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
 * happen before the request reaches the server are marked retryable. Filesystem codes are left
 * out: what `ENOENT` should tell a user depends on what the application was doing.
 */
export const nodeErrorCodes = freezeFeedbackMap({
  ECONNREFUSED: {
    message: "Could not connect to the server.",
    messageKey: "error.node.network.connectionRefused",
    source: "node.network",
    isRetryable: true,
  },
  ENOTFOUND: {
    message: "The server address could not be found.",
    messageKey: "error.node.network.addressNotFound",
    source: "node.network",
    isRetryable: true,
  },
  ETIMEDOUT: {
    message: "The connection timed out.",
    messageKey: "error.node.network.connectionTimeout",
    source: "node.network",
    isRetryable: true,
  },
  UND_ERR_CONNECT_TIMEOUT: {
    message: "The connection timed out.",
    messageKey: "error.node.network.connectionTimeout",
    source: "node.network",
    isRetryable: true,
  },
  ECONNRESET: {
    message: "The connection was reset.",
    messageKey: "error.node.network.connectionReset",
    source: "node.network",
  },
  UND_ERR_SOCKET: {
    message: "The connection was closed unexpectedly.",
    messageKey: "error.node.network.connectionClosed",
    source: "node.network",
  },
  UND_ERR_HEADERS_TIMEOUT: {
    message: "The server took too long to respond.",
    messageKey: "error.node.network.responseTimeout",
    source: "node.network",
  },
  UND_ERR_BODY_TIMEOUT: {
    message: "The server took too long to respond.",
    messageKey: "error.node.network.responseTimeout",
    source: "node.network",
  },
});

const nodeErrorPatternDefinitions: readonly (readonly [RegExp, ErrorFeedback])[] = [
  [
    // The whole message of a failed built-in fetch. It is reached only when the cause carries
    // no registered code, so the failure is not known to be transient.
    /^fetch failed$/i,
    {
      message: "Network request failed.",
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
registry.patterns.addList(nodeErrorPatterns);

/**
 * An opt-in, read-only error registry pre-populated with mappings for Node.js network failures.
 *
 * Includes code mappings for socket, DNS, and built-in `fetch` failures (e.g., `ECONNREFUSED`,
 * `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT`) and a pattern mapping for a failed `fetch` with no
 * recognized cause.
 *
 * Importing this preset does not access Node.js globals or built-in modules.
 */
export const nodeErrorRegistry = freezeRegistry(registry);
