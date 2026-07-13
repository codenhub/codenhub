import { normalizeErrorIdentifier } from "./bucket";
import type { AppErrorType, ErrorFeedback, ErrorRegistry, ReadonlyErrorRegistry } from "./types";

interface NormalizedError {
  code: string | null;
  message: string | null;
  name: string | null;
}

interface ErrorClassification {
  type: Exclude<AppErrorType, "unknown">;
  message: string;
  messageKey: string | null;
  source: string | null;
  isRetryable: boolean;
}

const ERROR_UNWRAP_MAX_DEPTH = 3;
const ERROR_WRAPPER_FIELD_NAMES = ["cause", "originalError", "error", "err", "inner", "innerError"] as const;

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

const toKnownClassification = (feedback: ErrorFeedback): ErrorClassification => ({
  type: "known",
  message: feedback.message,
  messageKey: feedback.messageKey ?? null,
  source: feedback.source ?? null,
  isRetryable: feedback.isRetryable ?? false,
});

const toUnexpectedClassification = (feedback: ErrorFeedback): ErrorClassification => ({
  type: "unexpected",
  message: feedback.message,
  messageKey: feedback.messageKey ?? null,
  source: feedback.source ?? null,
  isRetryable: feedback.isRetryable ?? false,
});

const normalizeError = (error: unknown): NormalizedError => {
  if (typeof error === "string") {
    return { code: null, message: error, name: null };
  }

  if (!isRecord(error)) {
    return { code: null, message: null, name: null };
  }

  const rawCode = getRecordField(error, "code");
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

  return ERROR_WRAPPER_FIELD_NAMES.map((fieldName) => getRecordField(error, fieldName)).filter(
    (value) => value !== undefined && value !== null,
  );
};

export const getErrorCandidates = (error: unknown, maxDepth = ERROR_UNWRAP_MAX_DEPTH): unknown[] => {
  const visitedObjects = new Set<object>();

  if (isRecord(error)) {
    visitedObjects.add(error);
  }

  const pendingCandidates = [{ depth: 0, value: error }];
  const candidates: unknown[] = [];

  for (let index = 0; index < pendingCandidates.length; index += 1) {
    const candidate = pendingCandidates[index];

    candidates.push(candidate.value);

    if (candidate.depth >= maxDepth) {
      continue;
    }

    for (const wrappedErrorCandidate of getWrappedErrorCandidates(candidate.value)) {
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
  const normalizedMessage = normalizeErrorIdentifier(message);

  const exactFeedback = registry.messages.get(normalizedMessage);
  if (exactFeedback !== undefined) {
    return toKnownClassification(exactFeedback);
  }

  // Longest-prefix match: prefixes are pre-sorted descending by prefix length in the bucket.
  const sortedPrefixes = registry.prefixes.values();

  for (const definition of sortedPrefixes) {
    if (normalizedMessage.startsWith(definition.prefix)) {
      return toKnownClassification(definition);
    }
  }

  return null;
};

const resolveDeterministicKnownError = (
  registry: ErrorRegistry | ReadonlyErrorRegistry,
  { code, message, name }: NormalizedError,
): ErrorClassification | null => {
  if (code !== null) {
    const feedback = registry.codes.get(code);

    if (feedback !== undefined) {
      return toKnownClassification(feedback);
    }
  }

  if (name !== null) {
    const feedback = registry.names.get(name);

    if (feedback !== undefined) {
      return toKnownClassification(feedback);
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

  return toUnexpectedClassification(matchedDefinition);
};

export const classifyErrorCandidateKnown = (
  registry: ErrorRegistry | ReadonlyErrorRegistry,
  error: unknown,
): ErrorClassification | null => {
  const normalizedError = normalizeError(error);
  return resolveDeterministicKnownError(registry, normalizedError);
};

export const classifyErrorCandidateUnexpected = (
  registry: ErrorRegistry | ReadonlyErrorRegistry,
  error: unknown,
): ErrorClassification | null => {
  const normalizedError = normalizeError(error);
  return resolveHeuristicUnexpectedError(registry, normalizedError);
};
