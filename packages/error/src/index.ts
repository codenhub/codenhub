export interface AppErrorOptions {
  fallbackMessage?: string;
  registry?: ErrorRegistry;
}

export type AppErrorType = "known" | "unexpected" | "unknown";
export type AppErrorSource = string | null;

export interface ErrorFeedback {
  message: string;
  messageKey?: string;
  source?: string;
  retryable?: boolean;
}

export interface ErrorRegistryBucket {
  add(identifier: string, feedback: ErrorFeedback): void;
  addList(entries: readonly (readonly [identifier: string, feedback: ErrorFeedback])[]): void;
  clear(): void;
  get(identifier: string): ErrorFeedback | undefined;
  values(): IterableIterator<[string, ErrorFeedback]>;
}

export interface ErrorPrefixDefinition extends ErrorFeedback {
  prefix: string;
}

export interface ErrorPatternDefinition extends ErrorFeedback {
  pattern: RegExp;
}

export interface ErrorPrefixRegistryBucket {
  add(prefix: string, feedback: ErrorFeedback): void;
  addList(entries: readonly (readonly [prefix: string, feedback: ErrorFeedback])[]): void;
  clear(): void;
  values(): readonly ErrorPrefixDefinition[];
}

export interface ErrorPatternRegistryBucket {
  add(pattern: RegExp, feedback: ErrorFeedback): void;
  addList(entries: readonly (readonly [pattern: RegExp, feedback: ErrorFeedback])[]): void;
  clear(): void;
  values(): readonly ErrorPatternDefinition[];
}

export interface ErrorRegistry {
  codes: ErrorRegistryBucket;
  names: ErrorRegistryBucket;
  messages: ErrorRegistryBucket;
  prefixes: ErrorPrefixRegistryBucket;
  patterns: ErrorPatternRegistryBucket;
  clear(): void;
  merge(registry: ErrorRegistry): void;
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

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: AppError };
export type Result<T> = Ok<T> | Err;

export const DEFAULT_APP_ERROR_MESSAGE = "An unexpected error occurred.";

const ERROR_IDENTIFIER_TRAILING_PUNCTUATION_PATTERN = /[.!?]+$/;
const ERROR_UNWRAP_MAX_DEPTH = 3;
const ERROR_WRAPPER_FIELD_NAMES = ["cause", "originalError", "error"] as const;

const cloneFeedback = (feedback: ErrorFeedback): ErrorFeedback => ({ ...feedback });

const normalizeErrorIdentifier = (identifier: string): string => {
  return identifier.trim().replace(ERROR_IDENTIFIER_TRAILING_PUNCTUATION_PATTERN, "");
};

const createFeedbackMapBucket = (): ErrorRegistryBucket => {
  const entries = new Map<string, ErrorFeedback>();
  const add = (identifier: string, feedback: ErrorFeedback): void => {
    entries.set(identifier, cloneFeedback(feedback));
  };

  return {
    add,
    addList(errorEntries: readonly (readonly [identifier: string, feedback: ErrorFeedback])[]): void {
      for (const [identifier, feedback] of errorEntries) {
        add(identifier, feedback);
      }
    },
    clear(): void {
      entries.clear();
    },
    get(identifier: string): ErrorFeedback | undefined {
      const feedback = entries.get(identifier);
      return feedback === undefined ? undefined : cloneFeedback(feedback);
    },
    values(): IterableIterator<[string, ErrorFeedback]> {
      return Array.from(entries.entries(), ([identifier, feedback]): [string, ErrorFeedback] => [
        identifier,
        cloneFeedback(feedback),
      ]).values();
    },
  };
};

const createPrefixBucket = (): ErrorPrefixRegistryBucket => {
  const entries: ErrorPrefixDefinition[] = [];
  const add = (prefix: string, feedback: ErrorFeedback): void => {
    entries.push({ ...cloneFeedback(feedback), prefix: normalizeErrorIdentifier(prefix) });
  };

  return {
    add,
    addList(errorEntries: readonly (readonly [prefix: string, feedback: ErrorFeedback])[]): void {
      for (const [prefix, feedback] of errorEntries) {
        add(prefix, feedback);
      }
    },
    clear(): void {
      entries.length = 0;
    },
    values(): readonly ErrorPrefixDefinition[] {
      return entries.map((entry) => ({ ...entry }));
    },
  };
};

const createPatternBucket = (): ErrorPatternRegistryBucket => {
  const entries: ErrorPatternDefinition[] = [];
  const add = (pattern: RegExp, feedback: ErrorFeedback): void => {
    entries.push({ ...cloneFeedback(feedback), pattern: new RegExp(pattern.source, pattern.flags) });
  };

  return {
    add,
    addList(errorEntries: readonly (readonly [pattern: RegExp, feedback: ErrorFeedback])[]): void {
      for (const [pattern, feedback] of errorEntries) {
        add(pattern, feedback);
      }
    },
    clear(): void {
      entries.length = 0;
    },
    values(): readonly ErrorPatternDefinition[] {
      return entries.map((entry) => ({ ...entry, pattern: new RegExp(entry.pattern.source, entry.pattern.flags) }));
    },
  };
};

export const createErrorRegistry = (): ErrorRegistry => {
  const codes = createFeedbackMapBucket();
  const names = createFeedbackMapBucket();
  const messages = createFeedbackMapBucket();
  const prefixes = createPrefixBucket();
  const patterns = createPatternBucket();

  const registry: ErrorRegistry = {
    codes,
    names,
    messages,
    prefixes,
    patterns,
    clear(): void {
      codes.clear();
      names.clear();
      messages.clear();
      prefixes.clear();
      patterns.clear();
    },
    merge(sourceRegistry: ErrorRegistry): void {
      for (const [identifier, feedback] of sourceRegistry.codes.values()) {
        codes.add(identifier, feedback);
      }

      for (const [identifier, feedback] of sourceRegistry.names.values()) {
        names.add(identifier, feedback);
      }

      for (const [identifier, feedback] of sourceRegistry.messages.values()) {
        messages.add(identifier, feedback);
      }

      for (const { prefix, ...feedback } of sourceRegistry.prefixes.values()) {
        prefixes.add(prefix, feedback);
      }

      for (const { pattern, ...feedback } of sourceRegistry.patterns.values()) {
        patterns.add(pattern, feedback);
      }
    },
  };

  return registry;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const getStringField = (source: Record<string, unknown>, key: string): string | null => {
  const value = source[key];
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

const getKnownMessageFeedback = (registry: ErrorRegistry, message: string): ErrorClassification | null => {
  const normalizedMessage = normalizeErrorIdentifier(message);

  for (const [registeredMessage, feedback] of registry.messages.values()) {
    if (normalizeErrorIdentifier(registeredMessage) === normalizedMessage) {
      return toKnownClassification(feedback);
    }
  }

  const prefixDefinition = registry.prefixes.values().find((definition) => {
    return normalizedMessage.startsWith(definition.prefix);
  });

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

const classifyNormalizedError = (
  registry: ErrorRegistry,
  normalizedError: NormalizedError,
): ErrorClassification | null => {
  const knownError = resolveDeterministicKnownError(registry, normalizedError);

  if (knownError !== null) {
    return knownError;
  }

  return resolveHeuristicUnexpectedError(registry, normalizedError);
};

export class AppError extends Error {
  static readonly registry = createErrorRegistry();

  static createRegistry(): ErrorRegistry {
    return createErrorRegistry();
  }

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
    const registry = options.registry ?? AppError.registry;

    for (const errorCandidate of errorCandidates) {
      const classification = classifyNormalizedError(registry, normalizeError(errorCandidate));

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

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = (error: unknown, options: AppErrorOptions = {}): Err => ({
  ok: false,
  error: new AppError(error, typeof error === "string" ? { fallbackMessage: error, ...options } : options),
});

export default AppError;
