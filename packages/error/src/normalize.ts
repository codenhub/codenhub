import { normalizeErrorMessage } from "./bucket";
import type { AppErrorType, ErrorFeedback, ErrorPrefixDefinition, ErrorRegistry, ReadonlyErrorRegistry } from "./types";

interface NormalizedError {
  code: string | null;
  message: string | null;
  name: string | null;
}

interface ErrorClassification {
  type: Exclude<AppErrorType, "unknown">;
  code: string | null;
  message: string;
  messageKey: string | null;
  source: string | null;
  isRetryable: boolean;
}

interface ClassifyErrorCandidateOptions {
  registry: ErrorRegistry | ReadonlyErrorRegistry;
  error: unknown;
  shouldMatchPatterns: boolean;
}

const ERROR_UNWRAP_MAX_DEPTH = 3;
// A cause chain is linear, so following it further costs one candidate per level, where every
// other wrapper field multiplies the candidates at each depth.
const ERROR_CAUSE_MAX_DEPTH = 8;
const ERROR_WRAPPER_FIELD_NAMES = ["cause", "originalError", "error", "err", "inner", "innerError"] as const;
const ERROR_LIST_FIELD_NAME = "errors";
const ERROR_LIST_MAX_LENGTH = 10;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return (typeof value === "object" || typeof value === "function") && value !== null;
};

const getRecordField = (source: Record<string, unknown>, key: string): unknown => {
  try {
    return source[key];
  } catch {
    return undefined;
  }
};

const getStringField = (source: Record<string, unknown>, key: string): string | null => {
  const value = getRecordField(source, key);
  return typeof value === "string" ? value : null;
};

// Built-in buckets validate feedback on registration, but a hand-written registry can return
// anything, so the fields are checked again before they reach an AppError.
const toClassification = (
  type: ErrorClassification["type"],
  feedback: ErrorFeedback,
  code: string | null = null,
): ErrorClassification => {
  const { message, messageKey, source, isRetryable } = feedback;

  if (typeof message !== "string" || message.trim().length === 0) {
    throw new TypeError("Error registry returned feedback without a non-empty message.");
  }

  return {
    type,
    code,
    message,
    messageKey: typeof messageKey === "string" ? messageKey : null,
    source: typeof source === "string" ? source : null,
    isRetryable: isRetryable === true,
  };
};

// DOMException carries a legacy numeric `code` (20 for AbortError) that does not identify the
// failure; its `name` does. Read through the tag so no global is touched and realms do not matter.
const isDomException = (error: Record<string, unknown>): boolean => {
  try {
    return Object.prototype.toString.call(error) === "[object DOMException]";
  } catch {
    return false;
  }
};

const normalizeError = (error: unknown): NormalizedError => {
  if (typeof error === "string") {
    return { code: null, message: error, name: null };
  }

  if (!isRecord(error)) {
    return { code: null, message: null, name: null };
  }

  const rawCode = isDomException(error) ? undefined : getRecordField(error, "code");
  const code = typeof rawCode === "string" ? rawCode : typeof rawCode === "number" ? String(rawCode) : null;

  return {
    code,
    message: getStringField(error, "message"),
    name: getStringField(error, "name"),
  };
};

const getWrappedErrorCandidates = (error: unknown): unknown[] => {
  if (!isRecord(error)) {
    return [];
  }

  const wrappedErrors = ERROR_WRAPPER_FIELD_NAMES.map((fieldName) => getRecordField(error, fieldName));

  // `AggregateError.errors`, and the same list shape on API responses. Capped so one long list
  // cannot multiply the candidates at every depth.
  try {
    const errorList = getRecordField(error, ERROR_LIST_FIELD_NAME);

    if (Array.isArray(errorList)) {
      wrappedErrors.push(...(errorList.slice(0, ERROR_LIST_MAX_LENGTH) as unknown[]));
    }
  } catch {
    // An unreadable list contributes no candidates.
  }

  return wrappedErrors.filter((value) => value !== undefined && value !== null);
};

const getCauseCandidate = (error: unknown): unknown[] => {
  const cause = isRecord(error) ? getRecordField(error, "cause") : undefined;

  return cause === undefined || cause === null ? [] : [cause];
};

/**
 * @internal
 * @throws TypeError - If `maxDepth` is not an integer from 0 through the supported maximum.
 */
export const assertValidMaxDepth = (maxDepth: number): void => {
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > ERROR_UNWRAP_MAX_DEPTH) {
    throw new TypeError(`AppError maxDepth must be an integer from 0 through ${ERROR_UNWRAP_MAX_DEPTH}.`);
  }
};

/**
 * Collects the error value and every nested wrapper candidate found within `maxDepth`,
 * skipping objects already visited so cyclic wrappers terminate. At the maximum depth, a
 * `cause` chain alone is followed further.
 *
 * @internal
 * @throws TypeError - If `maxDepth` is not an integer from 0 through the supported maximum.
 */
export const getErrorCandidates = (error: unknown, maxDepth = ERROR_UNWRAP_MAX_DEPTH): unknown[] => {
  assertValidMaxDepth(maxDepth);

  const visitedObjects = new Set<object>();

  if (isRecord(error)) {
    visitedObjects.add(error);
  }

  const pendingCandidates = [{ depth: 0, value: error }];
  const candidates: unknown[] = [];

  for (let index = 0; index < pendingCandidates.length; index += 1) {
    const candidate = pendingCandidates[index];

    candidates.push(candidate.value);

    let wrappedErrorCandidates: unknown[];

    if (candidate.depth < maxDepth) {
      wrappedErrorCandidates = getWrappedErrorCandidates(candidate.value);
    } else if (maxDepth === ERROR_UNWRAP_MAX_DEPTH && candidate.depth < ERROR_CAUSE_MAX_DEPTH) {
      wrappedErrorCandidates = getCauseCandidate(candidate.value);
    } else {
      continue;
    }

    for (const wrappedErrorCandidate of wrappedErrorCandidates) {
      if (isRecord(wrappedErrorCandidate)) {
        if (visitedObjects.has(wrappedErrorCandidate)) {
          continue;
        }

        visitedObjects.add(wrappedErrorCandidate);
      }

      pendingCandidates.push({ depth: candidate.depth + 1, value: wrappedErrorCandidate });
    }
  }

  return candidates;
};

const getKnownMessageFeedback = (
  registry: ErrorRegistry | ReadonlyErrorRegistry,
  message: string,
): ErrorClassification | null => {
  const normalizedMessage = normalizeErrorMessage(message);

  const exactFeedback = registry.messages.get(normalizedMessage);
  if (exactFeedback !== undefined) {
    return toClassification("known", exactFeedback);
  }

  // Scanning for the longest match keeps custom registries that return unordered prefix
  // definitions correct without copying and sorting the list on every classification.
  let longestMatch: ErrorPrefixDefinition | null = null;

  for (const definition of registry.prefixes.values()) {
    if (
      normalizedMessage.startsWith(definition.prefix) &&
      (longestMatch === null || definition.prefix.length > longestMatch.prefix.length)
    ) {
      longestMatch = definition;
    }
  }

  return longestMatch === null ? null : toClassification("known", longestMatch);
};

const resolveDeterministicKnownError = (
  registry: ErrorRegistry | ReadonlyErrorRegistry,
  { code, message, name }: NormalizedError,
): ErrorClassification | null => {
  if (code !== null) {
    const feedback = registry.codes.get(code);

    if (feedback !== undefined) {
      return toClassification("known", feedback, code.trim());
    }
  }

  if (name !== null) {
    const feedback = registry.names.get(name);

    if (feedback !== undefined) {
      return toClassification("known", feedback, name.trim());
    }
  }

  if (message !== null) {
    const feedback = getKnownMessageFeedback(registry, message);

    if (feedback !== null) {
      return feedback;
    }
  }

  return null;
};

const resolveHeuristicUnexpectedError = (
  registry: ErrorRegistry | ReadonlyErrorRegistry,
  { message }: NormalizedError,
): ErrorClassification | null => {
  if (message === null) {
    return null;
  }

  const matchedDefinition = registry.patterns.values().find((definition) => definition.pattern.test(message));

  if (matchedDefinition === undefined) {
    return null;
  }

  return toClassification("unexpected", matchedDefinition);
};

/**
 * Resolves the registry classification for a single candidate, preferring a deterministic
 * known match over a heuristic pattern match.
 *
 * @internal
 */
export const classifyErrorCandidate = ({
  registry,
  error,
  shouldMatchPatterns,
}: ClassifyErrorCandidateOptions): ErrorClassification | null => {
  const normalizedError = normalizeError(error);
  const knownClassification = resolveDeterministicKnownError(registry, normalizedError);
  return (
    knownClassification ?? (shouldMatchPatterns ? resolveHeuristicUnexpectedError(registry, normalizedError) : null)
  );
};
