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

export const normalizeErrorIdentifier = (identifier: string): string => {
  return identifier.trim().replace(ERROR_IDENTIFIER_TRAILING_PUNCTUATION_PATTERN, "");
};

const cloneFeedback = (feedback: ErrorFeedback): ErrorFeedback => ({ ...feedback });

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

/** Creates an empty, isolated registry for classifying unknown errors. */
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
