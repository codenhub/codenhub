import { freezeFeedbackMap } from "../bucket";
import { createErrorRegistry, freezeRegistry } from "../registry";
import type { ErrorFeedback } from "../types";

/**
 * Raw name mapping definitions for common browser and Web API errors.
 *
 * Provides fallback messages, stable consumer translation keys, and source labels for typical browser DOMExceptions.
 */
export const browserErrorNames = freezeFeedbackMap({
  AbortError: {
    message: "Request cancelled.",
    messageKey: "error.browser.abort",
    source: "browser",
  },
  QuotaExceededError: {
    message: "Browser storage quota exceeded.",
    messageKey: "error.browser.storageQuotaExceeded",
    source: "browser.storage",
  },
  NotAllowedError: {
    message: "Permission was denied.",
    messageKey: "error.browser.permissionDenied",
    source: "browser.permissions",
  },
  NotFoundError: {
    message: "The requested resource could not be found.",
    messageKey: "error.browser.notFound",
    source: "browser",
  },
  SecurityError: {
    message: "The operation is insecure.",
    messageKey: "error.browser.security",
    source: "browser",
  },
  TimeoutError: {
    message: "The operation timed out.",
    messageKey: "error.browser.timeout",
    source: "browser",
    isRetryable: true,
  },
  NotSupportedError: {
    message: "The operation is not supported.",
    messageKey: "error.browser.notSupported",
    source: "browser",
  },
  InvalidStateError: {
    message: "The operation is invalid in the current state.",
    messageKey: "error.browser.invalidState",
    source: "browser",
  },
  NetworkError: {
    message: "A network error occurred.",
    messageKey: "error.browser.network",
    source: "browser.network",
  },
});

const browserErrorPatternDefinitions: readonly (readonly [RegExp, ErrorFeedback])[] = [
  [
    /connection refused|dns_probe_finished/i,
    {
      message: "Could not connect to the server.",
      messageKey: "error.browser.connectionRefused",
      source: "browser.network",
      isRetryable: true,
    },
  ] as const,
  [
    /failed to fetch|networkerror|load failed/i,
    {
      message: "Network request failed.",
      messageKey: "error.browser.network",
      source: "browser.network",
    },
  ] as const,
];

/**
 * Read-only heuristic pattern mappings for common browser and Web API errors.
 *
 * Identifies fetch failures, DNS issues, and network connection refusal.
 */
export const browserErrorPatterns: readonly (readonly [RegExp, Readonly<ErrorFeedback>])[] = Object.freeze(
  browserErrorPatternDefinitions.map(([pattern, feedback]) =>
    Object.freeze([Object.freeze(pattern) as RegExp, Object.freeze({ ...feedback })] as const),
  ),
);

const registry = createErrorRegistry();

registry.names.addList(Object.entries(browserErrorNames));
registry.patterns.addList(browserErrorPatterns);

/**
 * An opt-in, read-only error registry pre-populated with mappings for common browser and Web API errors.
 *
 * Includes name mappings for DOMException types (e.g., `AbortError`, `TimeoutError`, `QuotaExceededError`)
 * and pattern mappings for network fetch failures (e.g., DNS errors, connection refusal).
 *
 * Importing this registry preset does not access or require browser/DOM globals.
 */
export const browserErrorRegistry = freezeRegistry(registry);
