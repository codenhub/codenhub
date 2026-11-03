import type { ErrorFeedback } from "@codenhub/error";

import type { StoreErrorCode } from "./types";

/**
 * Provides user-facing feedback for every recoverable store failure.
 *
 * Register `Object.entries(storeErrors)` in an `@codenhub/error` registry's `codes` bucket.
 * Store events retain diagnostic details; these messages are safe to show to users.
 */
export const storeErrors: Record<StoreErrorCode, ErrorFeedback> = {
  "store.read_failed": {
    message: "We couldn't load saved data. Try again in a moment.",
    source: "store",
  },
  "store.write_failed": {
    message: "We couldn't save your changes. Check whether they were saved before trying again.",
    source: "store",
  },
  "store.clear_failed": {
    message: "We couldn't remove saved data. Check whether it was removed before trying again.",
    source: "store",
  },
  "store.clear_unsupported": {
    message: "We couldn't remove saved data because of a problem on our side. Contact support.",
    source: "store",
  },
  "store.parse_failed": {
    message: "We couldn't use saved data. Contact support before making changes that could replace it.",
    source: "store",
  },
  "store.validation_failed": {
    message: "We couldn't use saved data. Contact support before making changes that could replace it.",
    source: "store",
  },
};
