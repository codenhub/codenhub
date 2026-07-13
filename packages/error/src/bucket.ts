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
export const normalizeErrorIdentifier = (identifier: string): string => {
  return identifier.trim().replace(ERROR_IDENTIFIER_TRAILING_PUNCTUATION_PATTERN, "");
};

/**
 * Asserts that an identifier normalizes to a non-empty string.
 *
 * @throws TypeError - If the identifier is empty after normalization.
 * @internal
 */
export const assertNonEmptyIdentifier = (identifier: string, label: string): void => {
  if (typeof identifier !== "string" || normalizeErrorIdentifier(identifier).length === 0) {
    throw new TypeError(`Error registry ${label} must be a non-empty string.`);
  }
};

/**
 * Validates that a feedback object has the required shape and field types.
 *
 * @throws TypeError - If feedback is missing or has invalid field types.
 * @internal
 */
export const assertFeedback = (feedback: ErrorFeedback): void => {
  if (typeof feedback !== "object" || feedback === null) {
    throw new TypeError("Error registry feedback must be an object.");
  }

  if (typeof feedback.message !== "string" || feedback.message.trim().length === 0) {
    throw new TypeError("Error registry feedback.message must be a non-empty string.");
  }

  if (feedback.messageKey !== undefined && typeof feedback.messageKey !== "string") {
    throw new TypeError("Error registry feedback.messageKey must be a string when provided.");
  }

  if (feedback.source !== undefined && typeof feedback.source !== "string") {
    throw new TypeError("Error registry feedback.source must be a string when provided.");
  }

  if (feedback.isRetryable !== undefined && typeof feedback.isRetryable !== "boolean") {
    throw new TypeError("Error registry feedback.isRetryable must be a boolean when provided.");
  }
};

/** @internal */
export const cloneFeedback = (feedback: ErrorFeedback): ErrorFeedback => ({ ...feedback });

/**
 * Creates a feedback map bucket for exact identifier matching (codes, names, messages).
 *
 * @internal
 */
export const createFeedbackMapBucket = (): ErrorRegistryBucket => {
  const entries = new Map<string, ErrorFeedback>();
  const add = (identifier: string, feedback: ErrorFeedback): void => {
    assertNonEmptyIdentifier(identifier, "identifier");
    assertFeedback(feedback);

    entries.set(normalizeErrorIdentifier(identifier), cloneFeedback(feedback));
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
    delete(identifier: string): boolean {
      assertNonEmptyIdentifier(identifier, "identifier");
      return entries.delete(normalizeErrorIdentifier(identifier));
    },
    get(identifier: string): ErrorFeedback | undefined {
      const feedback = entries.get(normalizeErrorIdentifier(identifier));
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

/**
 * Creates a prefix bucket for longest-prefix message matching.
 *
 * @internal
 */
export const createPrefixBucket = (): ErrorPrefixRegistryBucket => {
  const entries = new Map<string, ErrorFeedback>();
  const add = (prefix: string, feedback: ErrorFeedback): void => {
    assertNonEmptyIdentifier(prefix, "prefix");
    assertFeedback(feedback);

    entries.set(normalizeErrorIdentifier(prefix), cloneFeedback(feedback));
  };

  return {
    add,
    addList(errorEntries: readonly (readonly [prefix: string, feedback: ErrorFeedback])[]): void {
      for (const [prefix, feedback] of errorEntries) {
        add(prefix, feedback);
      }
    },
    clear(): void {
      entries.clear();
    },
    delete(prefix: string): boolean {
      assertNonEmptyIdentifier(prefix, "prefix");
      return entries.delete(normalizeErrorIdentifier(prefix));
    },
    values(): readonly ErrorPrefixDefinition[] {
      return Array.from(
        entries.entries(),
        ([prefix, feedback]): ErrorPrefixDefinition => ({
          ...cloneFeedback(feedback),
          prefix,
        }),
      );
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
  const add = (pattern: RegExp, feedback: ErrorFeedback): void => {
    if (!(pattern instanceof RegExp)) {
      throw new TypeError("Error registry pattern must be a RegExp.");
    }

    assertFeedback(feedback);

    const source = pattern.source;
    const flags = pattern.flags.replace(/[gy]/g, "");
    const existingIndex = entries.findIndex(
      (entry) => entry.pattern.source === source && entry.pattern.flags === flags,
    );

    const definition: ErrorPatternDefinition = {
      ...cloneFeedback(feedback),
      pattern: new RegExp(source, flags),
    };

    if (existingIndex !== -1) {
      entries[existingIndex] = definition;
    } else {
      entries.push(definition);
    }
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
    delete(pattern: RegExp): boolean {
      if (!(pattern instanceof RegExp)) {
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
      return isDeleted;
    },
    values(): readonly ErrorPatternDefinition[] {
      return entries.map((entry) => ({ ...entry, pattern: new RegExp(entry.pattern.source, entry.pattern.flags) }));
    },
  };
};
