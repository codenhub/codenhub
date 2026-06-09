import { AppError } from "../index";

export const browserErrorRegistry = AppError.createRegistry();

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
]);
