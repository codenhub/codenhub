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

const resolveFromAppError = (appError: AppError, originalError: unknown): AppErrorResolution => ({
  type: appError.type,
  message: appError.message,
  messageKey: appError.messageKey,
  source: appError.source,
  originalError,
  isRetryable: appError.isRetryable,
});

/**
 * Normalizes an unknown error value into a predictable, structured AppError shape.
 *
 * This function processes the error value by unrolling nested wrappers (e.g., `cause` or `originalError`)
 * up to a fixed depth to locate a registered classification.
 *
 * Classifications are resolved in priority order across all candidates:
 * 1. Known AppError or deterministic registry match (code, name, message, prefix).
 * 2. Unexpected AppError or heuristic registry match (pattern).
 * 3. Any remaining AppError candidate.
 * 4. Fallback unknown error.
 *
 * @param error - The raw error value to normalize (e.g., Error instances, plain objects, or strings).
 * @param options - Configuration options controlling fallback message and registry source.
 * @returns A normalized AppError instance. If the input is already a normalized AppError, it is returned as-is.
 */
export function createAppError(error: unknown, options: AppErrorOptions = {}): AppError {
  const hasCustomOptions =
    options.fallbackMessage !== undefined || options.registry !== undefined || options.maxDepth !== undefined;

  if (isAppError(error) && !hasCustomOptions) {
    return error;
  }

  const fallbackMessage = options.fallbackMessage ?? DEFAULT_APP_ERROR_MESSAGE;
  const errorCandidates = getErrorCandidates(isAppError(error) ? error.originalError : error, options.maxDepth);
  const registry = options.registry ?? getErrorRegistry();

  // Single pass over candidates resolving by priority tier:
  // known > unexpected > appError fallback (any type).
  // All tiers are collected before returning so that a "known" match deep in the
  // chain wins over an "unexpected" match at the surface.
  let knownResult: AppErrorResolution | null = null;
  let unexpectedResult: AppErrorResolution | null = null;
  let appErrorFallback: AppErrorResolution | null = null;

  for (const candidate of errorCandidates) {
    if (isAppError(candidate)) {
      if (candidate.type === "known") {
        knownResult = resolveFromAppError(candidate, error);
        break;
      } else if (candidate.type === "unexpected" && unexpectedResult === null) {
        unexpectedResult = resolveFromAppError(candidate, error);
      } else if (appErrorFallback === null) {
        appErrorFallback = resolveFromAppError(candidate, error);
      }
      continue;
    }

    const classification = classifyErrorCandidateKnown(registry, candidate);
    if (classification !== null) {
      knownResult = { ...classification, originalError: error };
      break;
    }

    if (unexpectedResult === null) {
      const classification = classifyErrorCandidateUnexpected(registry, candidate);
      if (classification !== null) {
        unexpectedResult = { ...classification, originalError: error };
      }
    }
  }

  return new AppErrorImpl(
    knownResult ??
      unexpectedResult ??
      appErrorFallback ?? {
        type: "unknown",
        message: fallbackMessage,
        messageKey: null,
        source: null,
        originalError: error,
        isRetryable: false,
      },
  );
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
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    APP_ERROR_BRAND in value &&
    (value as Record<symbol, unknown>)[APP_ERROR_BRAND] === true
  );
}
