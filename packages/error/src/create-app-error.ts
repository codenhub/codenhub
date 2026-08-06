import { classifyErrorCandidate, getErrorCandidates } from "./normalize";
import { getErrorRegistry, isReadableErrorRegistry } from "./registry";
import type {
  AppError,
  AppErrorOptions,
  AppErrorSource,
  AppErrorType,
  ErrorRegistry,
  ReadonlyErrorRegistry,
} from "./types";

interface AppErrorResolution {
  type: AppErrorType;
  message: string;
  messageKey: string | null;
  source: AppErrorSource;
  originalError: unknown;
  isRetryable: boolean;
}

interface CreateAppErrorInput {
  error: unknown;
  options: AppErrorOptions;
  shouldClassifyRootString: boolean;
}

interface ResolvedAppErrorOptions {
  fallbackMessage: string;
  registry: ErrorRegistry | ReadonlyErrorRegistry;
  maxDepth: number | undefined;
  hasCustomOptions: boolean;
}

/** Default message used when no registry entry or fallback message can describe an error. */
export const DEFAULT_APP_ERROR_MESSAGE = "An unexpected error occurred.";

const APP_ERROR_INSTANCES = new WeakSet<object>();

class AppErrorImpl extends Error implements AppError {
  readonly type: AppErrorType;
  readonly messageKey: string | null;
  readonly source: AppErrorSource;
  declare readonly originalError: unknown;
  readonly isRetryable: boolean;

  constructor(resolved: AppErrorResolution) {
    super(resolved.message, { cause: resolved.originalError });
    Object.defineProperty(this, "message", { enumerable: true });
    this.name = "AppError";
    this.type = resolved.type;
    this.messageKey = resolved.messageKey;
    this.source = resolved.source;
    this.isRetryable = resolved.isRetryable;
    Object.defineProperty(this, "originalError", {
      value: resolved.originalError,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    APP_ERROR_INSTANCES.add(this);
    Object.freeze(this);
  }
}

/**
 * Reads each supplied option once and validates it before any traversal begins.
 *
 * @throws TypeError - If options or any supplied option value is invalid.
 */
const resolveOptions = (options: AppErrorOptions): ResolvedAppErrorOptions => {
  if (typeof options !== "object" || options === null) {
    throw new TypeError("AppError options must be an object.");
  }

  const { fallbackMessage, registry, maxDepth } = options;

  if (fallbackMessage !== undefined && (typeof fallbackMessage !== "string" || fallbackMessage.trim().length === 0)) {
    throw new TypeError("AppError options.fallbackMessage must be a non-empty string when provided.");
  }

  if (registry !== undefined && !isReadableErrorRegistry(registry)) {
    throw new TypeError("AppError options.registry must implement the readable registry interface.");
  }

  return {
    fallbackMessage: fallbackMessage ?? DEFAULT_APP_ERROR_MESSAGE,
    registry: registry ?? getErrorRegistry(),
    maxDepth,
    hasCustomOptions: fallbackMessage !== undefined || registry !== undefined || maxDepth !== undefined,
  };
};

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
 * up to the configured depth to locate a registered classification.
 *
 * Classifications are resolved in priority order across all candidates:
 * 1. Known AppError or deterministic registry match (code, name, message, prefix).
 * 2. Unexpected AppError or heuristic registry match (pattern).
 * 3. Any remaining AppError candidate.
 * 4. Fallback unknown error.
 *
 * @param error - The raw error value to normalize (e.g., Error instances, plain objects, or strings).
 * @param options - Configuration controlling fallback message, registry source, and wrapper depth.
 * @returns A frozen AppError. An existing AppError is returned as-is only when no custom options are supplied.
 * @throws TypeError - If `maxDepth` is not an integer from 0 through 3.
 */
const normalizeAppError = ({ error, options, shouldClassifyRootString }: CreateAppErrorInput): AppError => {
  const { fallbackMessage, registry, maxDepth, hasCustomOptions } = resolveOptions(options);

  if (isAppError(error) && !hasCustomOptions) {
    return error;
  }

  const errorCandidates = getErrorCandidates(isAppError(error) ? error.originalError : error, maxDepth);

  // Single pass over candidates resolving by priority tier:
  // known > unexpected > appError fallback (any type).
  // All tiers are collected before returning so that a "known" match deep in the
  // chain wins over an "unexpected" match at the surface.
  let knownResult: AppErrorResolution | null = null;
  let unexpectedResult: AppErrorResolution | null = null;
  let appErrorFallback: AppErrorResolution | null = null;

  for (const [candidateIndex, candidate] of errorCandidates.entries()) {
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

    if (!shouldClassifyRootString && candidateIndex === 0 && typeof candidate === "string") {
      continue;
    }

    const classification = classifyErrorCandidate({
      registry,
      error: candidate,
      shouldMatchPatterns: unexpectedResult === null,
    });
    if (classification?.type === "known") {
      knownResult = { ...classification, originalError: error };
      break;
    }

    if (classification?.type === "unexpected" && unexpectedResult === null) {
      unexpectedResult = { ...classification, originalError: error };
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
};

export function createAppError(error: unknown, options: AppErrorOptions = {}): AppError {
  return normalizeAppError({ error, options, shouldClassifyRootString: true });
}

/** @internal */
export function createUntrustedAppError(error: unknown, options: AppErrorOptions = {}): AppError {
  return normalizeAppError({ error, options, shouldClassifyRootString: false });
}

/**
 * Type guard to determine if an unknown value is a normalized AppError instance.
 *
 * Verifies that a value was created by this package runtime.
 *
 * @param value - The value to inspect.
 * @returns True if the value is a normalized AppError; otherwise, false.
 */
export function isAppError(value: unknown): value is AppError {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }

  return APP_ERROR_INSTANCES.has(value);
}
