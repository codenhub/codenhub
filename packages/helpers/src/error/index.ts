export interface AppErrorOptions {
  fallbackMessage?: string;
}

export type AppErrorType = "known" | "unexpected" | "unknown";
export type AppErrorSource = string | null;

export interface ErrorFeedback {
  message: string;
  messageKey?: string;
  source?: string;
  retryable?: boolean;
}

interface RegisteredPrefixError extends ErrorFeedback {
  prefix: string;
}

interface RegisteredPatternError extends ErrorFeedback {
  pattern: RegExp;
}

interface NormalizedError {
  code: string | null;
  message: string | null;
  name: string | null;
}

interface ErrorClassification {
  type: Exclude<AppErrorType, "unknown">;
  message: string;
  messageKey: string | null;
  source: AppErrorSource;
  retryable: boolean;
}

interface AppErrorResolution {
  type: AppErrorType;
  message: string;
  messageKey: string | null;
  source: AppErrorSource;
  originalError: unknown;
  retryable: boolean;
}

export const DEFAULT_APP_ERROR_MESSAGE = "An unexpected error occurred.";

const ERROR_IDENTIFIER_TRAILING_PUNCTUATION_PATTERN = /[.!?]+$/;
const ERROR_UNWRAP_MAX_DEPTH = 3;
const ERROR_WRAPPER_FIELD_NAMES = ["cause", "originalError", "error"] as const;

const createFeedbackMapBucket = () => {
  const entries = new Map<string, ErrorFeedback>();

  return {
    add(identifier: string, feedback: ErrorFeedback): void {
      entries.set(identifier, feedback);
    },
    clear(): void {
      entries.clear();
    },
    get(identifier: string): ErrorFeedback | undefined {
      return entries.get(identifier);
    },
    values(): IterableIterator<[string, ErrorFeedback]> {
      return entries.entries();
    },
  };
};

const createPrefixBucket = () => {
  const entries: RegisteredPrefixError[] = [];

  return {
    add(prefix: string, feedback: ErrorFeedback): void {
      entries.push({ ...feedback, prefix: normalizeErrorIdentifier(prefix) });
    },
    clear(): void {
      entries.length = 0;
    },
    values(): readonly RegisteredPrefixError[] {
      return entries;
    },
  };
};

const createPatternBucket = () => {
  const entries: RegisteredPatternError[] = [];

  return {
    add(pattern: RegExp, feedback: ErrorFeedback): void {
      entries.push({ ...feedback, pattern: new RegExp(pattern.source, pattern.flags) });
    },
    clear(): void {
      entries.length = 0;
    },
    values(): readonly RegisteredPatternError[] {
      return entries;
    },
  };
};

export const AppErrorRegistry = {
  codes: createFeedbackMapBucket(),
  names: createFeedbackMapBucket(),
  messages: createFeedbackMapBucket(),
  prefixes: createPrefixBucket(),
  patterns: createPatternBucket(),
  clear(): void {
    this.codes.clear();
    this.names.clear();
    this.messages.clear();
    this.prefixes.clear();
    this.patterns.clear();
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const getStringField = (source: Record<string, unknown>, key: string): string | null => {
  const value = source[key];
  return typeof value === "string" ? value : null;
};

const normalizeErrorIdentifier = (identifier: string): string => {
  return identifier.trim().replace(ERROR_IDENTIFIER_TRAILING_PUNCTUATION_PATTERN, "");
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

  return ERROR_WRAPPER_FIELD_NAMES.map((fieldName) => error[fieldName]).filter(
    (value) => value !== undefined && value !== null,
  );
};

const getErrorCandidates = (error: unknown): unknown[] => {
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

const getKnownMessageFeedback = (message: string): ErrorClassification | null => {
  const normalizedMessage = normalizeErrorIdentifier(message);

  for (const [registeredMessage, feedback] of AppErrorRegistry.messages.values()) {
    if (normalizeErrorIdentifier(registeredMessage) === normalizedMessage) {
      return toKnownClassification(feedback);
    }
  }

  const prefixDefinition = AppErrorRegistry.prefixes.values().find((definition) => {
    return normalizedMessage.startsWith(definition.prefix);
  });

  if (prefixDefinition === undefined) {
    return null;
  }

  return toKnownClassification(prefixDefinition);
};

const resolveDeterministicKnownError = ({ code, message, name }: NormalizedError): ErrorClassification | null => {
  if (code !== null) {
    const feedback = AppErrorRegistry.codes.get(code);

    if (feedback !== undefined) {
      return toKnownClassification(feedback);
    }
  }

  if (name !== null) {
    const feedback = AppErrorRegistry.names.get(name);

    if (feedback !== undefined) {
      return toKnownClassification(feedback);
    }
  }

  if (message !== null) {
    const feedback = getKnownMessageFeedback(message);

    if (feedback !== null) {
      return feedback;
    }
  }

  return null;
};

const resolveHeuristicUnexpectedError = ({ message }: NormalizedError): ErrorClassification | null => {
  if (message === null) {
    return null;
  }

  const definition = AppErrorRegistry.patterns.values().find((currentDefinition) => {
    return new RegExp(currentDefinition.pattern.source, currentDefinition.pattern.flags).test(message);
  });

  if (definition === undefined) {
    return null;
  }

  return toUnexpectedClassification(definition);
};

const classifyNormalizedError = (normalizedError: NormalizedError): ErrorClassification | null => {
  const knownError = resolveDeterministicKnownError(normalizedError);

  if (knownError !== null) {
    return knownError;
  }

  return resolveHeuristicUnexpectedError(normalizedError);
};

export class AppError extends Error {
  readonly type: AppErrorType;
  declare readonly message: string;
  readonly messageKey: string | null;
  readonly source: AppErrorSource;
  readonly originalError: unknown;
  readonly retryable: boolean;

  constructor(error: unknown, options: AppErrorOptions = {}) {
    const resolved = AppError.resolve(error, options);

    super(resolved.message);

    Object.setPrototypeOf(this, new.target.prototype);

    this.name = "AppError";
    this.type = resolved.type;
    this.messageKey = resolved.messageKey;
    this.source = resolved.source;
    this.originalError = resolved.originalError;
    this.retryable = resolved.retryable;
  }

  private static resolve(error: unknown, options: AppErrorOptions): AppErrorResolution {
    if (error instanceof AppError) {
      return {
        type: error.type,
        message: error.message,
        messageKey: error.messageKey,
        source: error.source,
        originalError: error.originalError,
        retryable: error.retryable,
      };
    }

    const fallbackMessage = options.fallbackMessage ?? DEFAULT_APP_ERROR_MESSAGE;
    const errorCandidates = getErrorCandidates(error);

    for (const errorCandidate of errorCandidates) {
      const classification = classifyNormalizedError(normalizeError(errorCandidate));

      if (classification !== null) {
        return {
          type: classification.type,
          message: classification.message,
          messageKey: classification.messageKey,
          source: classification.source,
          originalError: error,
          retryable: classification.retryable,
        };
      }
    }

    return {
      type: "unknown",
      message: fallbackMessage,
      messageKey: null,
      source: null,
      originalError: error,
      retryable: false,
    };
  }
}

export default AppError;
