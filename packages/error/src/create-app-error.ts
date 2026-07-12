import { classifyErrorCandidateKnown, classifyErrorCandidateUnexpected, getErrorCandidates } from "./normalize";
import { getErrorRegistry } from "./registry";
import type { AppError, AppErrorOptions, AppErrorSource, AppErrorType } from "./types";

interface AppErrorResolution {
  type: AppErrorType;
  message: string;
  messageKey: string | null;
  source: AppErrorSource;
  originalError: unknown;
  isRetryable: boolean;
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
  readonly isRetryable: boolean;

  constructor(resolved: AppErrorResolution) {
    super(resolved.message, { cause: resolved.originalError });
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "AppError";
    this.type = resolved.type;
    this.messageKey = resolved.messageKey;
    this.source = resolved.source;
    this.originalError = resolved.originalError;
    this.isRetryable = resolved.isRetryable;
  }
}

/**
 * Normalizes an unknown error value into a predictable, structured AppError shape.
 *
 * This function processes the error value by unrolling nested wrappers (e.g., `cause` or `originalError`)
 * up to a fixed depth to locate a registered classification.
 *
 * @param error - The raw error value to normalize (e.g., Error instances, plain objects, or strings).
 * @param options - Configuration options controlling fallback message and registry source.
 * @returns A normalized AppError instance. If the input is already a normalized AppError, it is returned as-is.
 */
export function createAppError(error: unknown, options: AppErrorOptions = {}): AppError {
  if (isAppError(error)) {
    return error;
  }

  const fallbackMessage = options.fallbackMessage ?? DEFAULT_APP_ERROR_MESSAGE;
  const errorCandidates = getErrorCandidates(error, options.maxDepth);
  const registry = options.registry ?? getErrorRegistry();

  for (const errorCandidate of errorCandidates) {
    if (isAppError(errorCandidate)) {
      if (errorCandidate.type === "known") {
        return new AppErrorImpl({
          type: "known",
          message: errorCandidate.message,
          messageKey: errorCandidate.messageKey,
          source: errorCandidate.source,
          originalError: error,
          isRetryable: errorCandidate.isRetryable,
        });
      }
      continue;
    }

    const classification = classifyErrorCandidateKnown(registry, errorCandidate);

    if (classification !== null) {
      return new AppErrorImpl({
        type: classification.type,
        message: classification.message,
        messageKey: classification.messageKey,
        source: classification.source,
        originalError: error,
        isRetryable: classification.isRetryable,
      });
    }
  }

  for (const errorCandidate of errorCandidates) {
    if (isAppError(errorCandidate)) {
      if (errorCandidate.type === "unexpected") {
        return new AppErrorImpl({
          type: "unexpected",
          message: errorCandidate.message,
          messageKey: errorCandidate.messageKey,
          source: errorCandidate.source,
          originalError: error,
          isRetryable: errorCandidate.isRetryable,
        });
      }
      continue;
    }

    const classification = classifyErrorCandidateUnexpected(registry, errorCandidate);

    if (classification !== null) {
      return new AppErrorImpl({
        type: classification.type,
        message: classification.message,
        messageKey: classification.messageKey,
        source: classification.source,
        originalError: error,
        isRetryable: classification.isRetryable,
      });
    }
  }

  for (const errorCandidate of errorCandidates) {
    if (isAppError(errorCandidate)) {
      return new AppErrorImpl({
        type: errorCandidate.type,
        message: errorCandidate.message,
        messageKey: errorCandidate.messageKey,
        source: errorCandidate.source,
        originalError: error,
        isRetryable: errorCandidate.isRetryable,
      });
    }
  }

  return new AppErrorImpl({
    type: "unknown",
    message: fallbackMessage,
    messageKey: null,
    source: null,
    originalError: error,
    isRetryable: false,
  });
}

/**
 * Type guard to determine if an unknown value is a normalized AppError instance.
 *
 * Checks the value's prototype chain and verifies the unique internal AppError brand symbol.
 *
 * @param value - The value to inspect.
 * @returns True if the value is a normalized AppError; otherwise, false.
 */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    APP_ERROR_BRAND in value &&
    (value as Record<symbol, unknown>)[APP_ERROR_BRAND] === true
  );
}
