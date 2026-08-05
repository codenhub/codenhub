import type {
  ErrorFeedback,
  ErrorPatternDefinition,
  ErrorPatternRegistryBucket,
  ErrorPrefixDefinition,
  ErrorPrefixRegistryBucket,
  ErrorRegistryBucket,
} from "./types";

const ERROR_IDENTIFIER_TRAILING_PUNCTUATION_PATTERN = /[.!?]+$/;

/**
 * Normalizes an error identifier by trimming whitespace and stripping trailing punctuation (like `.`, `!`, `?`).
 *
 * @internal
 * @param identifier - The raw error identifier string.
 * @returns The normalized error identifier string.
 */
export const normalizeErrorMessage = (identifier: string): string => {
  return identifier.trim().replace(ERROR_IDENTIFIER_TRAILING_PUNCTUATION_PATTERN, "").trim();
};

/** @internal */
export const normalizeExactErrorIdentifier = (identifier: string): string => {
  return identifier.trim();
};

/**
 * Copies and validates feedback while reading each external property once.
 *
 * @throws TypeError - If feedback is missing or has invalid field types.
 * @internal
 */
export const cloneFeedback = (feedback: ErrorFeedback): ErrorFeedback => {
  if (typeof feedback !== "object" || feedback === null) {
    throw new TypeError("Error registry feedback must be an object.");
  }

  let message: unknown;
  let messageKey: unknown;
  let source: unknown;
  let isRetryable: unknown;

  try {
    message = feedback.message;
    messageKey = feedback.messageKey;
    source = feedback.source;
    isRetryable = feedback.isRetryable;
  } catch {
    throw new TypeError("Error registry feedback fields must be readable.");
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    throw new TypeError("Error registry feedback.message must be a non-empty string.");
  }

  if (messageKey !== undefined && typeof messageKey !== "string") {
    throw new TypeError("Error registry feedback.messageKey must be a string when provided.");
  }

  if (source !== undefined && typeof source !== "string") {
    throw new TypeError("Error registry feedback.source must be a string when provided.");
  }

  if (isRetryable !== undefined && typeof isRetryable !== "boolean") {
    throw new TypeError("Error registry feedback.isRetryable must be a boolean when provided.");
  }

  const clone: ErrorFeedback = { message };

  if (messageKey !== undefined) {
    clone.messageKey = messageKey;
  }

  if (source !== undefined) {
    clone.source = source;
  }

  if (isRetryable !== undefined) {
    clone.isRetryable = isRetryable;
  }

  return clone;
};

/** @internal */
export const freezeFeedbackMap = (
  feedbackMap: Record<string, ErrorFeedback>,
): Readonly<Record<string, Readonly<ErrorFeedback>>> => {
  const frozenFeedbackMap = Object.fromEntries(
    Object.entries(feedbackMap).map(([key, feedback]) => [key, Object.freeze(cloneFeedback(feedback))]),
  ) as Readonly<Record<string, Readonly<ErrorFeedback>>>;

  return Object.freeze(frozenFeedbackMap);
};

const clonePrefixDefinition = (definition: ErrorPrefixDefinition): ErrorPrefixDefinition => {
  return { ...cloneFeedback(definition), prefix: definition.prefix };
};

const clonePatternDefinition = (definition: ErrorPatternDefinition): ErrorPatternDefinition => {
  return { ...cloneFeedback(definition), pattern: new RegExp(definition.pattern.source, definition.pattern.flags) };
};

const REGEXP_SOURCE_GETTER = Object.getOwnPropertyDescriptor(RegExp.prototype, "source")?.get;

const isRegExp = (value: unknown): value is RegExp => {
  if (typeof value !== "object" || value === null || REGEXP_SOURCE_GETTER === undefined) {
    return false;
  }

  try {
    REGEXP_SOURCE_GETTER.call(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Creates a feedback map bucket for exact identifier matching (codes, names, messages).
 *
 * @internal
 */
export const createFeedbackMapBucket = (normalizeIdentifier: (identifier: string) => string): ErrorRegistryBucket => {
  const entries = new Map<string, ErrorFeedback>();
  const getNormalizedIdentifier = (identifier: string): string => {
    if (typeof identifier !== "string") {
      throw new TypeError("Error registry identifier must be a non-empty string.");
    }

    const normalizedIdentifier = normalizeIdentifier(identifier);
    if (normalizedIdentifier.length === 0) {
      throw new TypeError("Error registry identifier must be a non-empty string.");
    }
    return normalizedIdentifier;
  };
  const prepareEntry = ([identifier, feedback]: readonly [string, ErrorFeedback]): [string, ErrorFeedback] => [
    getNormalizedIdentifier(identifier),
    cloneFeedback(feedback),
  ];
  const add = (identifier: string, feedback: ErrorFeedback): void => {
    entries.set(...prepareEntry([identifier, feedback]));
  };

  return {
    add,
    addList(errorEntries: readonly (readonly [identifier: string, feedback: ErrorFeedback])[]): void {
      const preparedEntries = errorEntries.map(prepareEntry);
      for (const entry of preparedEntries) {
        entries.set(...entry);
      }
    },
    clear(): void {
      entries.clear();
    },
    delete(identifier: string): boolean {
      return entries.delete(getNormalizedIdentifier(identifier));
    },
    get(identifier: string): ErrorFeedback | undefined {
      if (typeof identifier !== "string") {
        return undefined;
      }

      const normalizedIdentifier = normalizeIdentifier(identifier);
      if (normalizedIdentifier.length === 0) {
        return undefined;
      }

      const feedback = entries.get(normalizedIdentifier);
      return feedback === undefined ? undefined : cloneFeedback(feedback);
    },
    *values(): IterableIterator<[string, ErrorFeedback]> {
      for (const [identifier, feedback] of entries) {
        yield [identifier, cloneFeedback(feedback)];
      }
    },
  };
};

/**
 * Creates a prefix bucket for longest-prefix message matching.
 *
 * @internal
 */
export const createPrefixBucket = (): ErrorPrefixRegistryBucket => {
  const entries = new Map<string, ErrorFeedback>();
  let sortedCache: ErrorPrefixDefinition[] | null = null;

  const rebuildCache = (): void => {
    sortedCache = Array.from(
      entries.entries(),
      ([prefix, feedback]): ErrorPrefixDefinition => ({
        ...cloneFeedback(feedback),
        prefix,
      }),
    ).sort((a, b) => b.prefix.length - a.prefix.length);
  };

  const getSortedCache = (): readonly ErrorPrefixDefinition[] => {
    if (sortedCache === null) {
      rebuildCache();
    }
    return sortedCache!;
  };

  const prepareEntry = ([prefix, feedback]: readonly [string, ErrorFeedback]): [string, ErrorFeedback] => {
    if (typeof prefix !== "string" || normalizeErrorMessage(prefix).length === 0) {
      throw new TypeError("Error registry prefix must be a non-empty string.");
    }

    return [normalizeErrorMessage(prefix), cloneFeedback(feedback)];
  };
  const add = (prefix: string, feedback: ErrorFeedback): void => {
    entries.set(...prepareEntry([prefix, feedback]));
    sortedCache = null;
  };

  return {
    add,
    addList(errorEntries: readonly (readonly [prefix: string, feedback: ErrorFeedback])[]): void {
      const preparedEntries = errorEntries.map(prepareEntry);
      for (const entry of preparedEntries) {
        entries.set(...entry);
      }
      sortedCache = null;
    },
    clear(): void {
      entries.clear();
      sortedCache = [];
    },
    delete(prefix: string): boolean {
      if (typeof prefix !== "string" || normalizeErrorMessage(prefix).length === 0) {
        throw new TypeError("Error registry prefix must be a non-empty string.");
      }
      const deleted = entries.delete(normalizeErrorMessage(prefix));
      if (deleted) {
        sortedCache = null;
      }
      return deleted;
    },
    values(): readonly ErrorPrefixDefinition[] {
      return getSortedCache().map(clonePrefixDefinition);
    },
  };
};

/**
 * Creates a pattern bucket for heuristic regex-based error matching.
 * Strips `g`/`y` flags from stored patterns to prevent stateful `lastIndex` drift.
 *
 * @internal
 */
export const createPatternBucket = (): ErrorPatternRegistryBucket => {
  const entries: ErrorPatternDefinition[] = [];
  let cachedValues: ErrorPatternDefinition[] | null = null;

  const prepareDefinition = ([pattern, feedback]: readonly [RegExp, ErrorFeedback]): ErrorPatternDefinition => {
    if (!isRegExp(pattern)) {
      throw new TypeError("Error registry pattern must be a RegExp.");
    }

    const source = pattern.source;
    const flags = pattern.flags.replace(/[gy]/g, "");
    return {
      ...cloneFeedback(feedback),
      pattern: new RegExp(source, flags),
    };
  };
  const storeDefinition = (definition: ErrorPatternDefinition): void => {
    const existingIndex = entries.findIndex(
      (entry) => entry.pattern.source === definition.pattern.source && entry.pattern.flags === definition.pattern.flags,
    );

    if (existingIndex !== -1) {
      entries[existingIndex] = definition;
    } else {
      entries.push(definition);
    }
    cachedValues = null;
  };
  const add = (pattern: RegExp, feedback: ErrorFeedback): void => {
    storeDefinition(prepareDefinition([pattern, feedback]));
  };

  return {
    add,
    addList(errorEntries: readonly (readonly [pattern: RegExp, feedback: ErrorFeedback])[]): void {
      const definitions = errorEntries.map(prepareDefinition);
      for (const definition of definitions) {
        storeDefinition(definition);
      }
    },
    clear(): void {
      entries.length = 0;
      cachedValues = [];
    },
    delete(pattern: RegExp): boolean {
      if (!isRegExp(pattern)) {
        throw new TypeError("Error registry pattern must be a RegExp.");
      }
      let isDeleted = false;
      const flags = pattern.flags.replace(/[gy]/g, "");
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].pattern.source === pattern.source && entries[i].pattern.flags === flags) {
          entries.splice(i, 1);
          isDeleted = true;
        }
      }
      if (isDeleted) {
        cachedValues = null;
      }
      return isDeleted;
    },
    values(): readonly ErrorPatternDefinition[] {
      if (cachedValues === null) {
        cachedValues = entries.map((entry) => ({
          ...entry,
          pattern: new RegExp(entry.pattern.source, entry.pattern.flags),
        }));
      }
      return cachedValues.map(clonePatternDefinition);
    },
  };
};
