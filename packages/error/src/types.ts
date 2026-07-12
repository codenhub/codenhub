/** Predictable normalized error shape. */
export interface AppError extends Error {
  /** Classification assigned after registry lookup and fallback handling. */
  readonly type: AppErrorType;
  /** Optional localization key from matched registry feedback. */
  readonly messageKey: string | null;
  /** Optional source label from matched registry feedback. */
  readonly source: AppErrorSource;
  /** Original value passed to the factory, or the original value from a wrapped error. */
  readonly originalError: unknown;
  /** Whether retrying the failed operation is likely to help. */
  readonly retryable: boolean;
}

/** Options that control how unknown errors are normalized. */
export interface AppErrorOptions {
  /** Message used when the error cannot be matched by the selected registry. */
  fallbackMessage?: string;
  /** Registry used for classification. Defaults to the active registry from `getErrorRegistry()`. */
  registry?: ErrorRegistry;
}

/** Classification assigned to a normalized application error. */
export type AppErrorType = "known" | "unexpected" | "unknown";

/** Optional source label for the system, package, or integration that produced an error. */
export type AppErrorSource = string | null;

/** Consumer-facing feedback returned when a registry entry matches an error. */
export interface ErrorFeedback {
  /** Safe user-facing message for the matched error. */
  message: string;
  /** Optional localization key for the message. */
  messageKey?: string;
  /** Optional source label, such as `auth`, `browser.network`, or `supabase.database`. */
  source?: string;
  /** Whether retrying the failed operation is likely to help. Defaults to `false`. */
  retryable?: boolean;
}

/** Registry bucket for exact string identifiers such as error codes, names, or messages. */
export interface ErrorRegistryBucket {
  /** Adds or replaces feedback for one normalized non-empty identifier, throwing `TypeError` for invalid input. */
  add(identifier: string, feedback: ErrorFeedback): void;
  /** Adds or replaces feedback for multiple normalized identifiers, throwing `TypeError` when any entry is invalid. */
  addList(entries: readonly (readonly [identifier: string, feedback: ErrorFeedback])[]): void;
  /** Removes all entries from this bucket. */
  clear(): void;
  /** Returns a defensive copy of feedback for a normalized identifier when present. */
  get(identifier: string): ErrorFeedback | undefined;
  /** Returns defensive copies of all bucket entries. */
  values(): IterableIterator<[string, ErrorFeedback]>;
}

/** Stored prefix mapping returned by prefix registry bucket inspection. */
export interface ErrorPrefixDefinition extends ErrorFeedback {
  /** Message prefix that is matched after trimming trailing sentence punctuation. */
  prefix: string;
}

/** Stored pattern mapping returned by pattern registry bucket inspection. */
export interface ErrorPatternDefinition extends ErrorFeedback {
  /** Regular expression used for heuristic message matching. */
  pattern: RegExp;
}

/** Registry bucket for known errors matched by longest normalized message prefix. */
export interface ErrorPrefixRegistryBucket {
  /** Adds prefix feedback after normalization, throwing `TypeError` for empty prefixes or invalid feedback. */
  add(prefix: string, feedback: ErrorFeedback): void;
  /** Adds multiple prefix feedback entries, throwing `TypeError` when any entry is invalid. */
  addList(entries: readonly (readonly [prefix: string, feedback: ErrorFeedback])[]): void;
  /** Removes all prefix entries. */
  clear(): void;
  /** Returns defensive copies of all prefix definitions. */
  values(): readonly ErrorPrefixDefinition[];
}

/** Registry bucket for unexpected errors matched heuristically by message pattern. */
export interface ErrorPatternRegistryBucket {
  /** Adds pattern feedback, throwing `TypeError` for non-`RegExp` patterns or invalid feedback. */
  add(pattern: RegExp, feedback: ErrorFeedback): void;
  /** Adds multiple pattern feedback entries, throwing `TypeError` when any entry is invalid. */
  addList(entries: readonly (readonly [pattern: RegExp, feedback: ErrorFeedback])[]): void;
  /** Removes all pattern entries. */
  clear(): void;
  /** Returns defensive copies of all pattern definitions. */
  values(): readonly ErrorPatternDefinition[];
}

/** Mutable collection of exact and heuristic mappings used to classify unknown errors. */
export interface ErrorRegistry {
  /** Exact error-code mappings, usually from APIs or databases. */
  codes: ErrorRegistryBucket;
  /** Exact error-name mappings, usually from `Error.name` or `DOMException.name`. */
  names: ErrorRegistryBucket;
  /** Exact error-message mappings after light punctuation normalization. */
  messages: ErrorRegistryBucket;
  /** Known-error mappings by normalized message prefix. */
  prefixes: ErrorPrefixRegistryBucket;
  /** Heuristic mappings by message pattern, classified as `unexpected`. */
  patterns: ErrorPatternRegistryBucket;
  /** Removes all mappings from every bucket. */
  clear(): void;
  /** Copies all mappings from another registry into this registry. */
  merge(registry: ErrorRegistry): void;
}
