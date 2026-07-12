import { normalizeErrorIdentifier } from "./registry";
import type { AppErrorType, ErrorFeedback, ErrorRegistry } from "./types";

export interface NormalizedError {
  code: string | null;
  message: string | null;
  name: string | null;
}

export interface ErrorClassification {
  type: Exclude<AppErrorType, "unknown">;
  message: string;
  messageKey: string | null;
  source: string | null;
  retryable: boolean;
}

const ERROR_UNWRAP_MAX_DEPTH = 3;
const ERROR_WRAPPER_FIELD_NAMES = ["cause", "originalError", "error"] as const;

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
  retryable: feedback.retryable ?? false,
});

const toUnexpectedClassification = (feedback: ErrorFeedback): ErrorClassification => ({
  type: "unexpected",
  message: feedback.message,
  messageKey: feedback.messageKey ?? null,
  source: feedback.source ?? null,
  retryable: feedback.retryable ?? false,
});

const normalizeError = (error: unknown): NormalizedError => {
  if (typeof error === "string") {
    return { code: null, message: error, name: null };
  }

  if (!isRecord(error)) {
    return { code: null, message: null, name: null };
  }

  return {
    code: getStringField(error, "code"),
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

export const getErrorCandidates = (error: unknown): unknown[] => {
  const candidates: unknown[] = [];
  const visitedObjects = new Set<object>();

  if (isRecord(error)) {
    visitedObjects.add(error);
  }

  const pendingCandidates = [{ depth: 0, value: error }];

  for (let index = 0; index < pendingCandidates.length; index += 1) {
    const candidate = pendingCandidates[index];

    candidates.push(candidate.value);

    if (candidate.depth >= ERROR_UNWRAP_MAX_DEPTH) {
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

const getKnownMessageFeedback = (registry: ErrorRegistry, message: string): ErrorClassification | null => {
  const normalizedMessage = normalizeErrorIdentifier(message);

  for (const [registeredMessage, feedback] of registry.messages.values()) {
    if (normalizeErrorIdentifier(registeredMessage) === normalizedMessage) {
      return toKnownClassification(feedback);
    }
  }

  const prefixDefinition = registry.prefixes
    .values()
    .filter((definition) => normalizedMessage.startsWith(definition.prefix))
    .sort((firstDefinition, secondDefinition) => secondDefinition.prefix.length - firstDefinition.prefix.length)[0];

  if (prefixDefinition === undefined) {
    return null;
  }

  return toKnownClassification(prefixDefinition);
};

const resolveDeterministicKnownError = (
  registry: ErrorRegistry,
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
  registry: ErrorRegistry,
  { message }: NormalizedError,
): ErrorClassification | null => {
  if (message === null) {
    return null;
  }

  const definition = registry.patterns.values().find((currentDefinition) => {
    return new RegExp(currentDefinition.pattern.source, currentDefinition.pattern.flags).test(message);
  });

  if (definition === undefined) {
    return null;
  }

  return toUnexpectedClassification(definition);
};

export const classifyErrorCandidate = (registry: ErrorRegistry, error: unknown): ErrorClassification | null => {
  const normalizedError = normalizeError(error);
  const knownError = resolveDeterministicKnownError(registry, normalizedError);

  if (knownError !== null) {
    return knownError;
  }

  return resolveHeuristicUnexpectedError(registry, normalizedError);
};
