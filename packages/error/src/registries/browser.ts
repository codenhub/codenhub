/**
 * Browser and Web API error preset: common DOMException names mapped to safe feedback.
 *
 * @packageDocumentation
 */

import { freezeFeedbackMap } from "../bucket";
import { createErrorRegistry, freezeRegistry } from "../registry";
import type { ErrorFeedback } from "../types";
import { DEVELOPER_FAULT_MESSAGE } from "./messages";

const MODULE_LOAD_FAILED = {
  message:
    "We couldn't load part of this page. It may have been updated since you opened it, or your connection dropped. Reload the page to continue.",
  messageKey: "error.browser.moduleLoadFailed",
  source: "browser.network",
};

/**
 * Raw name mapping definitions for common browser and Web API errors.
 *
 * Provides fallback messages, stable consumer translation keys, and source labels for typical browser DOMExceptions.
 */
export const browserErrorNames = freezeFeedbackMap({
  AbortError: {
    message: "The request was cancelled before it finished.",
    messageKey: "error.browser.abort",
    source: "browser",
  },
  QuotaExceededError: {
    message:
      "This couldn't be saved because your browser's storage for this site is full. Clear some site data, then try again.",
    messageKey: "error.browser.storageQuotaExceeded",
    source: "browser.storage",
  },
  NotAllowedError: {
    message:
      "This was blocked because it wasn't allowed, either by you or by your browser. Try again, and allow it if your browser asks.",
    messageKey: "error.browser.permissionDenied",
    source: "browser.permissions",
  },
  NotFoundError: {
    message: "We couldn't find something this needs. Try again, and reload the page if it keeps happening.",
    messageKey: "error.browser.notFound",
    source: "browser",
  },
  SecurityError: {
    message:
      "Your browser blocked this for security reasons. Try a different browser, and contact support if it keeps happening.",
    messageKey: "error.browser.security",
    source: "browser",
  },
  TimeoutError: {
    message: "This took too long and was stopped. Check your internet connection and try again.",
    messageKey: "error.browser.timeout",
    source: "browser",
  },
  NotSupportedError: {
    message: "Your browser doesn't support this. Update it or use a different browser.",
    messageKey: "error.browser.notSupported",
    source: "browser",
  },
  InvalidStateError: {
    message: DEVELOPER_FAULT_MESSAGE,
    messageKey: "error.browser.invalidState",
    source: "browser",
  },
  NetworkError: {
    message: "A network problem interrupted this. Check your internet connection and try again.",
    messageKey: "error.browser.network",
    source: "browser.network",
  },
  NotReadableError: {
    message:
      "We couldn't access the file or device this needs. Close any other app that is using it, or choose the file again, then retry.",
    messageKey: "error.browser.notReadable",
    source: "browser",
  },
  EncodingError: {
    message:
      "We couldn't read this file because it's damaged or in a format that isn't supported. Choose a different file.",
    messageKey: "error.browser.encoding",
    source: "browser",
  },
  // Not a DOMException: webpack names the error it throws when a code-split chunk fails to load,
  // which is most often a tab left open across a deploy.
  ChunkLoadError: MODULE_LOAD_FAILED,
});

const browserErrorPatternDefinitions: readonly (readonly [RegExp, ErrorFeedback])[] = [
  [
    // Anchored to the whole message each engine produces for a failed fetch, so unrelated text
    // such as "Config load failed" is not classified as a network failure.
    /^(?:failed to fetch|load failed|networkerror when attempting to fetch resource)\.?$/i,
    {
      // Distinct from error.browser.network so one translation key never has to cover both the
      // DOMException name match and this heuristic message match.
      message: "We couldn't reach the server. Check your internet connection and try again.",
      messageKey: "error.browser.requestFailed",
      source: "browser.network",
    },
  ] as const,
  [
    // What Chrome reports for a failed `import()`, followed by the module URL. Observed on
    // Chromium; Firefox and Safari word it differently and are not matched.
    /^failed to fetch dynamically imported module\b/i,
    MODULE_LOAD_FAILED,
  ] as const,
];

/**
 * Read-only heuristic pattern mappings for common browser and Web API errors.
 *
 * Identifies a failed fetch by the whole message each browser engine produces for one, and a
 * failed dynamic import by the message Chrome produces.
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
 * and pattern mappings for a failed fetch and a failed dynamic import.
 *
 * Importing this registry preset does not access or require browser/DOM globals.
 */
export const browserErrorRegistry = freezeRegistry(registry);
