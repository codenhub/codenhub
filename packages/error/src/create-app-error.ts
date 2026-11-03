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
  details: AppErrorDetails | null;
}

type AppErrorDetails = Readonly<Record<string, unknown>>;

/** The exact field set produced by `AppError.toJSON()`. */
interface SerializedAppError {
  name: string;
  message: string;
  type: AppErrorType;
  code: string | null;
  messageKey: string | null;
  source: AppErrorSource;
  isRetryable: boolean;
  details: AppErrorDetails | null;
}

interface ResolvedAppErrorOptions {
  fallbackMessage: string;
  registry: ErrorRegistry | ReadonlyErrorRegistry;
  maxDepth: number | undefined;
  hasCustomRegistry: boolean;
  details: AppErrorDetails | null;
}

/** Default message used when no registry entry or fallback message can describe an error. */
export const DEFAULT_APP_ERROR_MESSAGE = "An unexpected error occurred.";

const APP_ERROR_INSTANCES = new WeakSet<object>();

const DETAILS_MAX_DEPTH = 8;

const isPlainObject = (value: object): boolean => {
  const prototype: unknown = Object.getPrototypeOf(value);

  // A prototype whose own prototype is null is `Object.prototype` from any realm.
  return (
    (prototype === null || Object.getPrototypeOf(prototype) === null) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
};

// Copies a JSON value into frozen plain data, throwing for anything JSON cannot carry. A key whose
// value is `undefined` is dropped, as `JSON.stringify` drops it, so an optional field read in a
// `catch` does not replace the error being reported. The depth limit also ends a cycle. Keys are
// defined rather than assigned, so a `__proto__` key stays data.
const copyJsonValue = (value: unknown, depth: number): unknown => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "object" || depth >= DETAILS_MAX_DEPTH) {
    throw new TypeError("Not a JSON value.");
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = [];

    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        throw new TypeError("Not a JSON value.");
      }
      copy.push(copyJsonValue(value[index], depth + 1));
    }

    return Object.freeze(copy);
  }

  if (!isPlainObject(value)) {
    throw new TypeError("Not a JSON value.");
  }

  const copy: Record<string, unknown> = {};

  for (const key of Object.keys(value)) {
    const entry = (value as Record<string, unknown>)[key];

    if (entry === undefined) {
      continue;
    }

    Object.defineProperty(copy, key, {
      value: copyJsonValue(entry, depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return Object.freeze(copy);
};

/** Returns a frozen copy of valid details, or `null` for anything else. */
const readDetails = (value: unknown): AppErrorDetails | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  try {
    return copyJsonValue(value, 0) as AppErrorDetails;
  } catch {
    return null;
  }
};

// An existing AppError keeps the details it has; a later layer only adds keys it lacks, so no
// layer loses what an inner one recorded.
const mergeDetails = (inherited: AppErrorDetails | null, supplied: AppErrorDetails | null): AppErrorDetails | null => {
  if (supplied === null) {
    return inherited;
  }

  if (inherited === null) {
    return supplied;
  }

  return Object.keys(supplied).every((key) => Object.hasOwn(inherited, key))
    ? inherited
    : Object.freeze({ ...supplied, ...inherited });
};

// Freezing would also stop new properties, and frameworks add their own to every error they catch:
// Koa assigns `status` and hapi's Boom assigns `isBoom`, and on a non-extensible error that
// assignment throws inside the framework's error handler. Locking each existing property keeps the
// classification fixed while the error stays extensible.
const lockOwnProperties = (target: object): void => {
  const descriptors = Object.getOwnPropertyDescriptors(target);

  for (const key of Reflect.ownKeys(descriptors)) {
    // V8 gives each error an own `stack`, which `Error.captureStackTrace` redefines; libraries call
    // it on errors they rethrow, and on a locked stack that call throws. The stack is diagnostic,
    // not part of the classification.
    if (key === "stack") {
      continue;
    }

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
  readonly details: AppErrorDetails | null;

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
    this.details = resolved.details;
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
      details: this.details,
    };
  }
}

// The class is reachable through an instance's `constructor`, and building one directly would
// produce an AppError no registry classified. Pointing it at Error and freezing the prototype
// leaves `createAppError` and `appErrorFromJSON` as the only ways in and `toJSON` as the only
// serialization.
Object.defineProperty(AppErrorImpl.prototype, "constructor", { value: Error });
Object.freeze(AppErrorImpl.prototype);

/**
 * Reads each supplied option once and validates it before any traversal begins.
 *
 * @internal
 * @throws {TypeError} If options or any supplied option value is invalid.
 */
export const resolveAppErrorOptions = (options: AppErrorOptions): ResolvedAppErrorOptions => {
  if (typeof options !== "object" || options === null) {
    throw new TypeError("AppError options must be an object.");
  }

  const { fallbackMessage, registry, maxDepth, details } = options;

  if (fallbackMessage !== undefined && (typeof fallbackMessage !== "string" || fallbackMessage.trim().length === 0)) {
    throw new TypeError("AppError options.fallbackMessage must be a non-empty string when provided.");
  }

  if (registry !== undefined && !isReadableErrorRegistry(registry)) {
    throw new TypeError("AppError options.registry must implement the readable registry interface.");
  }

  if (maxDepth !== undefined) {
    assertValidMaxDepth(maxDepth);
  }

  const copiedDetails = details === undefined ? null : readDetails(details);

  if (details !== undefined && copiedDetails === null) {
    throw new TypeError(
      `AppError options.details must be a plain object holding only JSON values, nested at most ${DETAILS_MAX_DEPTH} levels deep.`,
    );
  }

  return {
    fallbackMessage: fallbackMessage ?? DEFAULT_APP_ERROR_MESSAGE,
    registry: registry ?? getErrorRegistry(),
    maxDepth,
    hasCustomRegistry: registry !== undefined,
    details: copiedDetails,
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
  details: appError.details,
});

const isSameClassification = (resolution: AppErrorResolution, appError: AppError): boolean =>
  resolution.type === appError.type &&
  resolution.code === appError.code &&
  resolution.message === appError.message &&
  resolution.messageKey === appError.messageKey &&
  resolution.source === appError.source &&
  resolution.isRetryable === appError.isRetryable &&
  resolution.details === appError.details;

/** @internal */
const normalizeAppError = (error: unknown, options: AppErrorOptions): AppError => {
  const { fallbackMessage, registry, maxDepth, hasCustomRegistry, details } = resolveAppErrorOptions(options);

  // An unknown error still carrying the default message was never worded by any layer, so the
  // first layer that supplies a fallback words it. After that its message stays, so it never
  // alternates as the error passes through layers that each supply one.
  const withFallbackMessage = (resolution: AppErrorResolution): AppErrorResolution =>
    resolution.type === "unknown" && resolution.message === DEFAULT_APP_ERROR_MESSAGE
      ? { ...resolution, message: fallbackMessage }
      : resolution;

  const finish = (resolution: AppErrorResolution, inherited: AppErrorDetails | null): AppErrorResolution => ({
    ...withFallbackMessage(resolution),
    details: mergeDetails(inherited, details),
  });

  // Only a supplied registry asks for an AppError to be classified again. The registry that
  // classified it may not be the global one, so a layer that passes a fallbackMessage alone
  // must not have the global registry replace what the error already says.
  if (isAppError(error) && !hasCustomRegistry) {
    const reworded = finish(resolveFromAppError(error, error), error.details);

    return isSameClassification(reworded, error) ? error : new AppErrorImpl(reworded);
  }

  // An AppError given a registry is classified again from the raw value it started from.
  // Unwinding earlier AppErrors first keeps an older classification from coming back as a
  // candidate on a later pass.
  const existingAppError = isAppError(error) ? error : null;
  let rawError = error;
  while (isAppError(rawError)) {
    rawError = rawError.originalError;
  }
  // A nested AppError already says what a registry made of its raw value. Only a supplied
  // registry asks for that value to be classified again; without one, looking inside would let
  // the global registry replace a classification a per-service registry made, one wrapper up.
  const errorCandidates = getErrorCandidates(rawError, maxDepth, hasCustomRegistry ? undefined : isAppError);

  // Single pass over candidates resolving by priority tier:
  // known > heuristic > appError fallback (any type).
  // All tiers are collected before returning so that a "known" match deep in the
  // chain wins over a "heuristic" match at the surface.
  let knownResult: AppErrorResolution | null = null;
  let nestedKnownResult: AppErrorResolution | null = null;
  let heuristicResult: AppErrorResolution | null = null;
  let appErrorFallback: AppErrorResolution | null = null;
  // The shallowest nested AppError's details, kept whichever candidate wins.
  let nestedDetails: AppErrorDetails | null = null;

  for (const candidate of errorCandidates) {
    if (isAppError(candidate)) {
      nestedDetails ??= candidate.details;

      if (candidate.type === "known") {
        // A supplied registry is asked for its wording, so a nested known AppError must not end
        // the search before the raw value inside it has been classified. It stands when the
        // registry has no known match of its own.
        if (hasCustomRegistry) {
          nestedKnownResult ??= resolveFromAppError(candidate, error);
          continue;
        }

        knownResult = resolveFromAppError(candidate, error);
        break;
      } else if (candidate.type === "heuristic" && heuristicResult === null) {
        heuristicResult = resolveFromAppError(candidate, error);
      } else if (appErrorFallback === null) {
        appErrorFallback = resolveFromAppError(candidate, error);
      }
      continue;
    }

    const classification = classifyErrorCandidate({
      registry,
      error: candidate,
      shouldMatchPatterns: heuristicResult === null,
    });
    if (classification?.type === "known") {
      knownResult = { ...classification, originalError: error, details: null };
      break;
    }

    if (classification?.type === "heuristic" && heuristicResult === null) {
      heuristicResult = { ...classification, originalError: error, details: null };
    }
  }

  // Re-normalization only ever upgrades: a heuristic match replaces an unknown error, a known
  // match replaces anything it differs from, and nothing else changes what the error already says.
  if (existingAppError !== null) {
    const replacement = finish(
      knownResult ??
        nestedKnownResult ??
        (existingAppError.type === "unknown" ? heuristicResult : null) ??
        resolveFromAppError(existingAppError, error),
      existingAppError.details,
    );

    return isSameClassification(replacement, existingAppError) ? existingAppError : new AppErrorImpl(replacement);
  }

  return new AppErrorImpl(
    finish(
      knownResult ??
        nestedKnownResult ??
        heuristicResult ??
        appErrorFallback ?? {
          type: "unknown",
          code: null,
          message: fallbackMessage,
          messageKey: null,
          source: null,
          originalError: error,
          isRetryable: false,
          details: null,
        },
      nestedDetails,
    ),
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
 * 2. Heuristic `AppError` or registry pattern match.
 * 3. Any remaining `AppError` candidate.
 * 4. An unknown error carrying the fallback message.
 *
 * A deep known match outranks a shallow heuristic match. A nested `AppError` is a candidate as it
 * stands: the raw value inside it is classified again only when a `registry` is supplied, and
 * then a known match from that registry outranks the nested classification.
 *
 * Ordinary unknown input never throws, including objects and proxies whose inspected properties
 * throw. A raw string is matched against the registry like any other candidate; when nothing
 * matches, the resolved message is the fallback rather than the string itself, so raw text is
 * never surfaced to consumers.
 *
 * @param error - The raw error value to normalize, such as an `Error`, plain object, or string.
 * @param options - Configuration controlling fallback message, registry source, and wrapper depth.
 * @returns An AppError whose own properties cannot be changed or removed. An existing AppError is
 * returned as-is unless a `registry` is supplied and finds something that improves on it: only a
 * heuristic match replaces an unknown error, and only a known match that differs replaces a
 * classified one. A `fallbackMessage` or `maxDepth` alone never changes a classification; a
 * `fallbackMessage` only words an unknown AppError that still carries the default message.
 * @throws {TypeError} If `options` is not an object, `fallbackMessage` is not a non-empty string,
 * `registry` does not expose the read-facing registry surface, or `maxDepth` is not an integer
 * from 0 through 3.
 */
export function createAppError(error: unknown, options: AppErrorOptions = {}): AppError {
  return normalizeAppError(error, options);
}

const APP_ERROR_TYPES: readonly unknown[] = ["known", "heuristic", "unknown"] satisfies readonly AppErrorType[];

const isNonEmptyStringOrNull = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && value.trim().length > 0);

// Reads each field once, so a value cannot answer the check one way and the build another.
const readSerializedAppError = (value: unknown): AppErrorResolution | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  let fields: Record<keyof SerializedAppError, unknown>;

  try {
    const { name, message, type, code, messageKey, source, isRetryable, details } = value as Record<string, unknown>;
    fields = { name, message, type, code, messageKey, source, isRetryable, details };
  } catch {
    return null;
  }

  const { name, message, type, code, messageKey, source, isRetryable, details } = fields;
  const copiedDetails = readDetails(details);

  if (
    name !== "AppError" ||
    typeof message !== "string" ||
    message.trim().length === 0 ||
    !APP_ERROR_TYPES.includes(type) ||
    !isNonEmptyStringOrNull(code) ||
    !isNonEmptyStringOrNull(messageKey) ||
    !isNonEmptyStringOrNull(source) ||
    typeof isRetryable !== "boolean" ||
    (details !== null && copiedDetails === null)
  ) {
    return null;
  }

  // Only a code or name match carries a code, and an unknown error carries no feedback at all, so
  // these combinations are not something `toJSON()` produces.
  if (
    (type !== "known" && code !== null) ||
    (type === "unknown" && (messageKey !== null || source !== null || isRetryable))
  ) {
    return null;
  }

  // The flag describes a call the sender made, such as its own database call, not the request that
  // carried the error back, which may already have run on the sender.
  return {
    type: type as AppErrorType,
    code,
    message,
    messageKey,
    source,
    originalError: value,
    isRetryable: false,
    details: copiedDetails,
  };
};

/**
 * Rebuilds an `AppError` from the shape `AppError.toJSON()` produces, for the receiving side of a
 * boundary an error was sent across as JSON, such as a server response read by a client.
 *
 * No registry is consulted: the rebuilt error carries the fields it was sent with, except that
 * `isRetryable` is always `false`, and the parsed value becomes its `originalError`. The sender's
 * flag describes a call the sender made, not the request that carried the error back, which may
 * already have run there. Whoever produced the value therefore chooses the message, so
 * use this only on data from a source the application trusts to word its errors, such as its own
 * server. Pass anything else to `createAppError`.
 *
 * @param value - The parsed JSON value, typically `JSON.parse` output or a response body field.
 * @returns The rebuilt AppError. An existing AppError is returned as it is. A value that does not
 * have exactly the serialized field types, or combines them in a way `toJSON()` never does, such as
 * an unknown error with a `code`, is normalized as raw input, as by `createAppError(value)`.
 */
export function appErrorFromJSON(value: unknown): AppError {
  if (isAppError(value)) {
    return value;
  }

  const resolution = readSerializedAppError(value);

  return resolution === null ? createAppError(value) : new AppErrorImpl(resolution);
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
