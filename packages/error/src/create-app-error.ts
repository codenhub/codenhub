import { assertValidMaxDepth, classifyErrorCandidate, getErrorCandidates } from "./normalize";
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
  code: string | null;
  message: string;
  messageKey: string | null;
  source: AppErrorSource;
  originalError: unknown;
  isRetryable: boolean;
}

/** The exact field set produced by `AppError.toJSON()`. */
interface SerializedAppError {
  name: string;
  message: string;
  type: AppErrorType;
  code: string | null;
  messageKey: string | null;
  source: AppErrorSource;
  isRetryable: boolean;
}

interface ResolvedAppErrorOptions {
  fallbackMessage: string;
  registry: ErrorRegistry | ReadonlyErrorRegistry;
  maxDepth: number | undefined;
  hasCustomRegistry: boolean;
}

/** Default message used when no registry entry or fallback message can describe an error. */
export const DEFAULT_APP_ERROR_MESSAGE = "An unexpected error occurred.";

const APP_ERROR_INSTANCES = new WeakSet<object>();

// Freezing would also stop new properties, and frameworks add their own to every error they catch:
// Koa assigns `status` and hapi's Boom assigns `isBoom`, and on a non-extensible error that
// assignment throws inside the framework's error handler. Locking each existing property keeps the
// classification fixed while the error stays extensible.
const lockOwnProperties = (target: object): void => {
  const descriptors = Object.getOwnPropertyDescriptors(target);

  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key as keyof typeof descriptors];

    if ("value" in descriptor) {
      descriptor.writable = false;
    }
    descriptor.configurable = false;
  }

  Object.defineProperties(target, descriptors);
};

class AppErrorImpl extends Error implements AppError {
  readonly type: AppErrorType;
  readonly code: string | null;
  readonly messageKey: string | null;
  readonly source: AppErrorSource;
  declare readonly originalError: unknown;
  readonly isRetryable: boolean;

  constructor(resolved: AppErrorResolution) {
    super(resolved.message, { cause: resolved.originalError });
    // Native Error hides message from enumeration, which would list it apart from the other
    // normalized fields when an AppError is logged, spread, or inspected.
    Object.defineProperty(this, "message", { enumerable: true });
    this.name = "AppError";
    this.type = resolved.type;
    this.code = resolved.code;
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
    lockOwnProperties(this);
  }

  // Serialization is declared explicitly so the published contract does not depend on which
  // own properties a given engine marks enumerable on native Error instances.
  toJSON(): SerializedAppError {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      code: this.code,
      messageKey: this.messageKey,
      source: this.source,
      isRetryable: this.isRetryable,
    };
  }
}

// The class is reachable through an instance's `constructor`, and building one directly would
// produce an AppError no registry classified. Pointing it at Error and freezing the prototype
// leaves the factory as the only way in and `toJSON` as the only serialization.
Object.defineProperty(AppErrorImpl.prototype, "constructor", { value: Error });
Object.freeze(AppErrorImpl.prototype);

/**
 * Reads each supplied option once and validates it before any traversal begins.
 *
 * @internal
 * @throws TypeError - If options or any supplied option value is invalid.
 */
export const resolveAppErrorOptions = (options: AppErrorOptions): ResolvedAppErrorOptions => {
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

  if (maxDepth !== undefined) {
    assertValidMaxDepth(maxDepth);
  }

  return {
    fallbackMessage: fallbackMessage ?? DEFAULT_APP_ERROR_MESSAGE,
    registry: registry ?? getErrorRegistry(),
    maxDepth,
    hasCustomRegistry: registry !== undefined,
  };
};

const resolveFromAppError = (appError: AppError, originalError: unknown): AppErrorResolution => ({
  type: appError.type,
  code: appError.code,
  message: appError.message,
  messageKey: appError.messageKey,
  source: appError.source,
  originalError,
  isRetryable: appError.isRetryable,
});

const isSameClassification = (resolution: AppErrorResolution, appError: AppError): boolean =>
  resolution.type === appError.type &&
  resolution.code === appError.code &&
  resolution.message === appError.message &&
  resolution.messageKey === appError.messageKey &&
  resolution.source === appError.source &&
  resolution.isRetryable === appError.isRetryable;

/** @internal */
const normalizeAppError = (error: unknown, options: AppErrorOptions): AppError => {
  const { fallbackMessage, registry, maxDepth, hasCustomRegistry } = resolveAppErrorOptions(options);

  // Only a supplied registry asks for an AppError to be classified again. The registry that
  // classified it may not be the global one, so a layer that passes a fallbackMessage alone
  // must not have the global registry replace what the error already says.
  if (isAppError(error) && !hasCustomRegistry) {
    return error;
  }

  // An AppError given a registry is classified again from the raw value it started from.
  // Unwinding earlier AppErrors first keeps an older classification from coming back as a
  // candidate on a later pass.
  const existingAppError = isAppError(error) ? error : null;
  let rawError = error;
  while (isAppError(rawError)) {
    rawError = rawError.originalError;
  }
  const errorCandidates = getErrorCandidates(rawError, maxDepth);

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

  // Re-normalization only ever upgrades: an unexpected match replaces an unknown error, a known
  // match replaces anything it differs from, and nothing else changes what the error already says.
  if (existingAppError !== null) {
    const replacement = knownResult ?? (existingAppError.type === "unknown" ? unexpectedResult : null);

    if (replacement === null || isSameClassification(replacement, existingAppError)) {
      return existingAppError;
    }

    return new AppErrorImpl(replacement);
  }

  return new AppErrorImpl(
    knownResult ??
      unexpectedResult ??
      appErrorFallback ?? {
        type: "unknown",
        code: null,
        message: fallbackMessage,
        messageKey: null,
        source: null,
        originalError: error,
        isRetryable: false,
      },
  );
};

/**
 * Normalizes an unknown error value into a predictable, immutable `AppError`.
 *
 * Unrolls nested wrapper fields (`cause`, `originalError`, `error`, `err`, `inner`, `innerError`)
 * up to the configured depth, and a `cause` chain alone past the default depth, then resolves a classification in priority order across every
 * candidate found:
 *
 * 1. Known `AppError` or deterministic registry match (code, name, exact message, prefix).
 * 2. Unexpected `AppError` or heuristic registry pattern match.
 * 3. Any remaining `AppError` candidate.
 * 4. An unknown error carrying the fallback message.
 *
 * A deep known match outranks a shallow unexpected match. Ordinary unknown input never throws,
 * including objects and proxies whose inspected properties throw. A raw string is matched against
 * the registry like any other candidate; when nothing matches, the resolved message is the
 * fallback rather than the string itself, so raw text is never surfaced to consumers.
 *
 * @param error - The raw error value to normalize, such as an `Error`, plain object, or string.
 * @param options - Configuration controlling fallback message, registry source, and wrapper depth.
 * @returns An AppError whose own properties cannot be changed or removed. An existing AppError is
 * returned as-is unless a `registry` is supplied and finds something that improves on it: only an
 * unexpected match replaces an unknown error, and only a known match that differs replaces a
 * classified one. A `fallbackMessage` or `maxDepth` alone never changes an AppError.
 * @throws TypeError - If `options` is not an object, `fallbackMessage` is not a non-empty string,
 * `registry` does not expose the read-facing registry surface, or `maxDepth` is not an integer
 * from 0 through 3.
 */
export function createAppError(error: unknown, options: AppErrorOptions = {}): AppError {
  return normalizeAppError(error, options);
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
