import { classifyErrorCandidate, getErrorCandidates } from "./normalize";
import { getErrorRegistry } from "./registry";
import type { AppError, AppErrorOptions, AppErrorSource, AppErrorType } from "./types";

interface AppErrorResolution {
  type: AppErrorType;
  message: string;
  messageKey: string | null;
  source: AppErrorSource;
  originalError: unknown;
  retryable: boolean;
}

/** Default message used when no registry entry or fallback message can describe an error. */
export const DEFAULT_APP_ERROR_MESSAGE = "An unexpected error occurred.";

const APP_ERROR_BRAND = Symbol.for("@codenhub/error/AppError");

class AppErrorImpl extends Error implements AppError {
  readonly [APP_ERROR_BRAND] = true;
  readonly type: AppErrorType;
  readonly messageKey: string | null;
  readonly source: AppErrorSource;
  readonly originalError: unknown;
  readonly retryable: boolean;

  constructor(resolved: AppErrorResolution) {
    super(resolved.message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "AppError";
    this.type = resolved.type;
    this.messageKey = resolved.messageKey;
    this.source = resolved.source;
    this.originalError = resolved.originalError;
    this.retryable = resolved.retryable;
  }
}

/**
 * Normalizes an unknown error value into a predictable AppError.
 * If the value is already an AppError, it is returned directly.
 */
export function createAppError(error: unknown, options: AppErrorOptions = {}): AppError {
  if (isAppError(error)) {
    return error;
  }

  const fallbackMessage = options.fallbackMessage ?? DEFAULT_APP_ERROR_MESSAGE;
  const errorCandidates = getErrorCandidates(error);
  const registry = options.registry ?? getErrorRegistry();

  for (const errorCandidate of errorCandidates) {
    const classification = classifyErrorCandidate(registry, errorCandidate);

    if (classification !== null) {
      return new AppErrorImpl({
        type: classification.type,
        message: classification.message,
        messageKey: classification.messageKey,
        source: classification.source,
        originalError: error,
        retryable: classification.retryable,
      });
    }
  }

  return new AppErrorImpl({
    type: "unknown",
    message: fallbackMessage,
    messageKey: null,
    source: null,
    originalError: error,
    retryable: false,
  });
}

/**
 * Type guard to check if a value is a normalized AppError.
 */
export function isAppError(value: unknown): value is AppError {
  return (
    value instanceof Error &&
    typeof value === "object" &&
    value !== null &&
    APP_ERROR_BRAND in value &&
    (value as Record<symbol, unknown>)[APP_ERROR_BRAND] === true
  );
}
