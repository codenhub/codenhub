import type {
  ErrorFeedback,
  ErrorPatternDefinition,
  ErrorPatternRegistryBucket,
  ErrorPrefixDefinition,
  ErrorPrefixRegistryBucket,
  ErrorRegistry,
  ErrorRegistryBucket,
} from "./types";

const ERROR_IDENTIFIER_TRAILING_PUNCTUATION_PATTERN = /[.!?]+$/;

/**
 * Normalizes an error identifier by trimming whitespace and stripping trailing punctuation (like `.`, `!`, `?`).
 *
 * @param identifier - The raw error identifier string.
 * @returns The normalized error identifier string.
 */
export const normalizeErrorIdentifier = (identifier: string): string => {
  return identifier.trim().replace(ERROR_IDENTIFIER_TRAILING_PUNCTUATION_PATTERN, "");
};

const assertNonEmptyIdentifier = (identifier: string, label: string): void => {
  if (typeof identifier !== "string" || normalizeErrorIdentifier(identifier).length === 0) {
    throw new TypeError(`Error registry ${label} must be a non-empty string.`);
  }
};

const assertFeedback = (feedback: ErrorFeedback): void => {
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

  if (feedback.retryable !== undefined && typeof feedback.retryable !== "boolean") {
    throw new TypeError("Error registry feedback.retryable must be a boolean when provided.");
  }
};

const cloneFeedback = (feedback: ErrorFeedback): ErrorFeedback => ({ ...feedback });

const createFeedbackMapBucket = (): ErrorRegistryBucket => {
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

const createPrefixBucket = (): ErrorPrefixRegistryBucket => {
  const entries: ErrorPrefixDefinition[] = [];
  const add = (prefix: string, feedback: ErrorFeedback): void => {
    assertNonEmptyIdentifier(prefix, "prefix");
    assertFeedback(feedback);

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
    if (!(pattern instanceof RegExp)) {
      throw new TypeError("Error registry pattern must be a RegExp.");
    }

    assertFeedback(feedback);

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

/**
 * Creates an empty, isolated error registry.
 *
 * Optionally merges a list of preset registries into the newly created registry.
 *
 * @param presets - Optional list of existing registries to merge during creation.
 * @returns A new, mutable ErrorRegistry instance.
 */
export const createErrorRegistry = (presets?: readonly ErrorRegistry[]): ErrorRegistry => {
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

  if (presets) {
    for (const preset of presets) {
      registry.merge(preset);
    }
  }

  return registry;
};

let activeRegistry: ErrorRegistry = createErrorRegistry();

/**
 * Retrieves the active global error registry.
 *
 * This registry is used as the default classification source for `createAppError`.
 *
 * @returns The current active ErrorRegistry.
 */
export const getErrorRegistry = (): ErrorRegistry => {
  return activeRegistry;
};

/**
 * Sets the active global error registry.
 *
 * Allows consumers to replace the default registry at application initialization.
 * Throws a TypeError if the provided value is null or not an object.
 *
 * @param registry - The ErrorRegistry instance to set as active.
 * @throws TypeError - If the parameter is not a valid ErrorRegistry.
 */
export const setErrorRegistry = (registry: ErrorRegistry): void => {
  if (typeof registry !== "object" || registry === null) {
    throw new TypeError("Error registry must be an object.");
  }
  activeRegistry = registry;
};
