import { createErrorRegistry } from "../index";

/**
 * Opt-in mutable registry preset for common browser and Web API errors.
 * Importing this preset does not require browser globals.
 */
export const browserErrorRegistry = createErrorRegistry();

browserErrorRegistry.names.addList([
  [
    "AbortError",
    {
      message: "Request cancelled.",
      messageKey: "error.browser.abort",
      source: "browser",
    },
  ],
  [
    "QuotaExceededError",
    {
      message: "Browser storage quota exceeded.",
      messageKey: "error.browser.storageQuotaExceeded",
      source: "browser.storage",
    },
  ],
  [
    "NotAllowedError",
    {
      message: "Permission was denied.",
      messageKey: "error.browser.permissionDenied",
      source: "browser.permissions",
    },
  ],
  [
    "NotFoundError",
    {
      message: "The requested resource could not be found.",
      messageKey: "error.browser.notFound",
      source: "browser",
    },
  ],
  [
    "SecurityError",
    {
      message: "The operation is insecure.",
      messageKey: "error.browser.security",
      source: "browser",
    },
  ],
  [
    "TimeoutError",
    {
      message: "The operation timed out.",
      messageKey: "error.browser.timeout",
      source: "browser",
      retryable: true,
    },
  ],
  [
    "NotSupportedError",
    {
      message: "The operation is not supported.",
      messageKey: "error.browser.notSupported",
      source: "browser",
    },
  ],
  [
    "InvalidStateError",
    {
      message: "The operation is invalid in the current state.",
      messageKey: "error.browser.invalidState",
      source: "browser",
    },
  ],
  [
    "NetworkError",
    {
      message: "A network error occurred.",
      messageKey: "error.browser.network",
      source: "browser.network",
      retryable: true,
    },
  ],
]);

browserErrorRegistry.patterns.addList([
  [
    /failed to fetch|networkerror|load failed/i,
    {
      message: "Network request failed.",
      messageKey: "error.browser.network",
      source: "browser.network",
      retryable: true,
    },
  ],
  [
    /connection refused|dns_probe_finished/i,
    {
      message: "Could not connect to the server.",
      messageKey: "error.browser.connectionRefused",
      source: "browser.network",
      retryable: true,
    },
  ],
]);
