import type {
  ErrorFeedback,
  ErrorPatternDefinition,
  ErrorPatternRegistryBucket,
  ErrorPrefixDefinition,
  ErrorPrefixRegistryBucket,
  ErrorRegistryBucket,
} from "./types";

const ERROR_IDENTIFIER_TRAILING_PUNCTUATION_PATTERN = /[.!?]+$/;
const ERROR_MESSAGE_KEY_PATTERN = /^error(?:\.[a-z][A-Za-z0-9]*)+$/;
const ERROR_SOURCE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/;

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
 * Copies, validates, and freezes feedback while reading each external property once.
 *
 * Stored entries are frozen at registration so read paths can share them instead of rebuilding
 * a defensive copy on every lookup.
 *
 * @throws TypeError - If feedback is missing or has invalid field types.
 * @internal
 */
export const freezeFeedback = (feedback: ErrorFeedback): Readonly<ErrorFeedback> => {
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

  if (messageKey !== undefined && (typeof messageKey !== "string" || !ERROR_MESSAGE_KEY_PATTERN.test(messageKey))) {
    throw new TypeError(
      "Error registry feedback.messageKey must be a dot-separated key under the error namespace when provided.",
    );
  }

  if (source !== undefined && (typeof source !== "string" || !ERROR_SOURCE_PATTERN.test(source))) {
    throw new TypeError(
      "Error registry feedback.source must use lowercase kebab-case namespace segments when provided.",
    );
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

  return Object.freeze(clone);
};

/** @internal */
export const freezeFeedbackMap = (
  feedbackMap: Record<string, ErrorFeedback>,
): Readonly<Record<string, Readonly<ErrorFeedback>>> => {
  const frozenFeedbackMap = Object.fromEntries(
    Object.entries(feedbackMap).map(([key, feedback]) => [key, freezeFeedback(feedback)]),
  ) as Readonly<Record<string, Readonly<ErrorFeedback>>>;

  return Object.freeze(frozenFeedbackMap);
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
  const entries = new Map<string, Readonly<ErrorFeedback>>();
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
  const prepareEntry = ([identifier, feedback]: readonly [string, ErrorFeedback]): [
    string,
    Readonly<ErrorFeedback>,
  ] => [getNormalizedIdentifier(identifier), freezeFeedback(feedback)];
  const add = (identifier: string, feedback: ErrorFeedback): void => {
    entries.set(...prepareEntry([identifier, feedback]));
  };

  return {
    add,
    addList(errorEntries: readonly (readonly [identifier: string, feedback: ErrorFeedback])[]): void {
      const preparedEntries = Array.from(errorEntries, prepareEntry);
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
    get(identifier: string): Readonly<ErrorFeedback> | undefined {
      if (typeof identifier !== "string") {
        return undefined;
      }

      const normalizedIdentifier = normalizeIdentifier(identifier);
      if (normalizedIdentifier.length === 0) {
        return undefined;
      }

      return entries.get(normalizedIdentifier);
    },
    *values(): IterableIterator<[string, Readonly<ErrorFeedback>]> {
      yield* entries;
    },
  };
};

/**
 * Creates a prefix bucket for longest-prefix message matching.
 *
 * @internal
 */
export const createPrefixBucket = (): ErrorPrefixRegistryBucket => {
  const entries = new Map<string, Readonly<ErrorPrefixDefinition>>();
  let sortedCache: readonly Readonly<ErrorPrefixDefinition>[] | null = null;

  const getNormalizedPrefix = (prefix: string): string => {
    const normalizedPrefix = typeof prefix === "string" ? normalizeErrorMessage(prefix) : "";
    if (normalizedPrefix.length === 0) {
      throw new TypeError("Error registry prefix must be a non-empty string.");
    }
    return normalizedPrefix;
  };
  const prepareEntry = ([prefix, feedback]: readonly [string, ErrorFeedback]): [
    string,
    Readonly<ErrorPrefixDefinition>,
  ] => {
    const normalizedPrefix = getNormalizedPrefix(prefix);
    return [normalizedPrefix, Object.freeze({ ...freezeFeedback(feedback), prefix: normalizedPrefix })];
  };
  const add = (prefix: string, feedback: ErrorFeedback): void => {
    entries.set(...prepareEntry([prefix, feedback]));
    sortedCache = null;
  };

  return {
    add,
    addList(errorEntries: readonly (readonly [prefix: string, feedback: ErrorFeedback])[]): void {
      const preparedEntries = Array.from(errorEntries, prepareEntry);
      for (const entry of preparedEntries) {
        entries.set(...entry);
      }
      sortedCache = null;
    },
    clear(): void {
      entries.clear();
      sortedCache = null;
    },
    delete(prefix: string): boolean {
      const deleted = entries.delete(getNormalizedPrefix(prefix));
      if (deleted) {
        sortedCache = null;
      }
      return deleted;
    },
    values(): readonly Readonly<ErrorPrefixDefinition>[] {
      sortedCache ??= Object.freeze(
        Array.from(entries.values()).sort((first, second) => second.prefix.length - first.prefix.length),
      );
      return sortedCache;
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
  const entries: Readonly<ErrorPatternDefinition>[] = [];
  let cachedValues: readonly Readonly<ErrorPatternDefinition>[] | null = null;

  const getStatelessFlags = (pattern: RegExp): string => {
    if (!isRegExp(pattern)) {
      throw new TypeError("Error registry pattern must be a RegExp.");
    }
    return pattern.flags.replace(/[gy]/g, "");
  };
  const prepareDefinition = ([pattern, feedback]: readonly [
    RegExp,
    ErrorFeedback,
  ]): Readonly<ErrorPatternDefinition> => {
    const flags = getStatelessFlags(pattern);
    return Object.freeze({
      ...freezeFeedback(feedback),
      // Freezing the stored RegExp is safe because stripping `g` and `y` leaves `test` stateless,
      // so read paths can share one instance instead of rebuilding it per lookup.
      pattern: Object.freeze(new RegExp(pattern.source, flags)),
    });
  };
  const storeDefinition = (definition: Readonly<ErrorPatternDefinition>): void => {
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
      const definitions = Array.from(errorEntries, prepareDefinition);
      for (const definition of definitions) {
        storeDefinition(definition);
      }
    },
    clear(): void {
      entries.length = 0;
      cachedValues = null;
    },
    delete(pattern: RegExp): boolean {
      const flags = getStatelessFlags(pattern);
      let isDeleted = false;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index].pattern.source === pattern.source && entries[index].pattern.flags === flags) {
          entries.splice(index, 1);
          isDeleted = true;
        }
      }
      if (isDeleted) {
        cachedValues = null;
      }
      return isDeleted;
    },
    values(): readonly Readonly<ErrorPatternDefinition>[] {
      cachedValues ??= Object.freeze([...entries]);
      return cachedValues;
    },
  };
};
