/**
 * A predictable, structured error shape representing a normalized application error.
 *
 * Implements the standard JavaScript `Error` interface and adds classification,
 * localization support, and original error wrapping.
 */
export interface AppError extends Error {
  /**
   * The classification of this error, denoting whether it was explicitly mapped
   * as a known error, matched heuristically as unexpected, or completely unknown.
   */
  readonly type: AppErrorType;

  /**
   * An optional localization key from matched registry feedback,
   * suitable for displaying translated messages to consumers.
   */
  readonly messageKey: string | null;

  /**
   * The optional source namespace, module, or package (e.g., `auth`, `supabase.database`)
   * that originally produced the error.
   */
  readonly source: AppErrorSource;

  /**
   * The original error value passed to the factory, or the original error retrieved
   * from nested wrapper structures (such as `cause`, `originalError`, or `error` properties).
   */
  readonly originalError: unknown;

  /**
   * Indicates whether retrying the operation that failed with this error is likely to succeed.
   */
  readonly isRetryable: boolean;
}

/**
 * Options configuration for controlling how raw error values are normalized into `AppError` instances.
 */
export interface AppErrorOptions {
  /**
   * The fallback error message to use when the error cannot be matched in the registry.
   * Defaults to `DEFAULT_APP_ERROR_MESSAGE`.
   */
  fallbackMessage?: string;

  /**
   * The specific error registry to query for classifications.
   * Defaults to the global registry retrieved by `getErrorRegistry()`.
   */
  registry?: ErrorRegistry;

  /**
   * The maximum depth to unwrap nested error wrappers (e.g. cause, originalError).
   * Defaults to 3.
   */
  maxDepth?: number;
}

/**
 * The classification level of a normalized application error.
 *
 * - `"known"`: Matched explicitly in the registry (by code, name, exact message, or prefix).
 * - `"unexpected"`: Matched heuristically via regex patterns in the registry.
 * - `"unknown"`: Could not be resolved/classified by the active registry.
 */
export type AppErrorType = "known" | "unexpected" | "unknown";

/**
 * The namespace or subsystem label (e.g., `browser`, `supabase.auth`) representing
 * where the error originated.
 */
export type AppErrorSource = string | null;

/**
 * The structured feedback returned when a registry matches an error.
 * Defines the safe user-facing message and metadata to attach to the `AppError`.
 */
export interface ErrorFeedback {
  /**
   * A safe, user-facing error message description.
   */
  message: string;

  /**
   * An optional localization/translation key corresponding to the message.
   */
  messageKey?: string;

  /**
   * An optional namespace or source label (e.g. `supabase.auth`).
   */
  source?: string;

  /**
   * Indicates if the operation can be safely retried.
   */
  isRetryable?: boolean;
}

/**
 * A registry bucket for storing and retrieving deterministic string-based error mappings
 * (such as error codes, error names, or exact messages).
 */
export interface ErrorRegistryBucket {
  /**
   * Adds or replaces error feedback for a given identifier.
   * Trims whitespace and strips trailing punctuation from the identifier before storing.
   *
   * @param identifier - The exact identifier to match (e.g., `"23505"`, `"AbortError"`).
   * @param feedback - The feedback metadata to attach to this identifier.
   * @throws TypeError - If the identifier is empty or feedback is invalid.
   */
  add(identifier: string, feedback: ErrorFeedback): void;

  /**
   * Adds or replaces multiple feedback entries from a list of tuple definitions.
   *
   * @param entries - List of tuples containing [identifier, feedback].
   * @throws TypeError - If any identifier or feedback in the list is invalid.
   */
  addList(entries: readonly (readonly [identifier: string, feedback: ErrorFeedback])[]): void;

  /**
   * Clears all mapped entries from this registry bucket.
   */
  clear(): void;

  /**
   * Retrieves a defensive copy of the feedback mapping for the specified identifier.
   *
   * @param identifier - The exact error identifier to lookup.
   * @returns The matched feedback mapping, or `undefined` if not found.
   */
  get(identifier: string): ErrorFeedback | undefined;

  /**
   * Removes error feedback mapped to the specified identifier.
   * Trims whitespace and strips trailing punctuation from the identifier before deleting.
   *
   * @param identifier - The exact identifier to delete.
   * @returns True if an element in the bucket existed and has been removed, or false if the element does not exist.
   */
  delete(identifier: string): boolean;

  /**
   * Returns an iterator yielding defensive copies of all mappings stored in the bucket.
   *
   * @returns An iterator of [identifier, feedback] entries.
   */
  values(): IterableIterator<[string, ErrorFeedback]>;
}

/**
 * Represents a registered message prefix definition and its feedback mapping.
 */
export interface ErrorPrefixDefinition extends ErrorFeedback {
  /**
   * The message prefix matched after trimming trailing sentence punctuation.
   */
  prefix: string;
}

/**
 * Represents a registered regex pattern definition and its feedback mapping.
 */
export interface ErrorPatternDefinition extends ErrorFeedback {
  /**
   * The RegExp instance used to evaluate heuristic error matches.
   */
  pattern: RegExp;
}

/**
 * A registry bucket for storing and matching error classifications based on message prefixes.
 */
export interface ErrorPrefixRegistryBucket {
  /**
   * Adds or replaces feedback for a given message prefix.
   * Strips trailing punctuation from the prefix before registration.
   *
   * @param prefix - The message prefix to register (e.g., `"Upload failed:"`).
   * @param feedback - The feedback metadata to assign when matching this prefix.
   * @throws TypeError - If the prefix is empty or feedback is invalid.
   */
  add(prefix: string, feedback: ErrorFeedback): void;

  /**
   * Adds or replaces multiple prefix feedback definitions from a list of tuples.
   *
   * @param entries - List of tuples containing [prefix, feedback].
   * @throws TypeError - If any entry is invalid.
   */
  addList(entries: readonly (readonly [prefix: string, feedback: ErrorFeedback])[]): void;

  /**
   * Clears all registered prefix definitions from this bucket.
   */
  clear(): void;

  /**
   * Removes prefix-based feedback definition for the specified prefix.
   * Strips trailing punctuation from the prefix before deletion.
   *
   * @param prefix - The message prefix to delete.
   * @returns True if the prefix definition existed and has been removed; otherwise, false.
   */
  delete(prefix: string): boolean;

  /**
   * Returns defensive copies of all prefix definitions registered in this bucket.
   *
   * @returns Readonly list of prefix definitions.
   */
  values(): readonly ErrorPrefixDefinition[];
}

/**
 * A registry bucket for storing and matching error classifications heuristically using RegExp patterns.
 */
export interface ErrorPatternRegistryBucket {
  /**
   * Adds or replaces a RegExp pattern and its feedback mapping.
   *
   * @param pattern - The regular expression to evaluate against error messages.
   * @param feedback - The feedback metadata to attach on pattern match.
   * @throws TypeError - If the pattern is not a RegExp or feedback is invalid.
   */
  add(pattern: RegExp, feedback: ErrorFeedback): void;

  /**
   * Adds or replaces multiple RegExp pattern definitions from a list of tuples.
   *
   * @param entries - List of tuples containing [pattern, feedback].
   * @throws TypeError - If any entry is invalid.
   */
  addList(entries: readonly (readonly [pattern: RegExp, feedback: ErrorFeedback])[]): void;

  /**
   * Clears all registered patterns from this bucket.
   */
  clear(): void;

  /**
   * Removes a RegExp pattern and its feedback mapping.
   *
   * @param pattern - The regular expression to remove.
   * @returns True if the pattern existed and has been removed; otherwise, false.
   */
  delete(pattern: RegExp): boolean;

  /**
   * Returns defensive copies of all pattern definitions registered in this bucket.
   * RegExp instances are stateless since global and sticky flags are stripped on registration.
   *
   * @returns Readonly list of pattern definitions.
   */
  values(): readonly ErrorPatternDefinition[];
}

/**
 * A mutable collection of exact and heuristic error buckets used to classify unknown errors.
 */
export interface ErrorRegistry {
  /**
   * Mappings for exact error codes, typically returned by database systems or APIs.
   */
  codes: ErrorRegistryBucket;

  /**
   * Mappings for exact error names, typically found on native `Error.name` or `DOMException.name` properties.
   */
  names: ErrorRegistryBucket;

  /**
   * Mappings for exact error messages (matched after trimming whitespace and trailing punctuation).
   */
  messages: ErrorRegistryBucket;

  /**
   * Mappings for matching errors by message prefixes (e.g., longest prefix match wins).
   */
  prefixes: ErrorPrefixRegistryBucket;

  /**
   * Heuristic mappings for matching errors using RegExp patterns. Matches are classified as `"unexpected"`.
   */
  patterns: ErrorPatternRegistryBucket;

  /**
   * Clears all mappings from every bucket in this registry.
   */
  clear(): void;

  /**
   * Merges all mappings from the source registry into this registry, overwriting matching identifiers.
   *
   * @param registry - The source registry to merge. Accepts both mutable and read-only registries.
   */
  merge(registry: ErrorRegistry | ReadonlyErrorRegistry): void;
}

/**
 * A read-only view of an error registry returned by `freezeRegistry`.
 *
 * Exposes only the read-facing surface of each bucket. Mutation methods (`add`, `addList`,
 * `clear`, `delete`) are not part of this type. Suitable as a preset source passed to
 * `createErrorRegistry` or `merge`.
 */
export interface ReadonlyErrorRegistry {
  /** Read-only view of code mappings. */
  readonly codes: Pick<ErrorRegistryBucket, "get" | "values">;
  /** Read-only view of name mappings. */
  readonly names: Pick<ErrorRegistryBucket, "get" | "values">;
  /** Read-only view of message mappings. */
  readonly messages: Pick<ErrorRegistryBucket, "get" | "values">;
  /** Read-only view of prefix definitions. */
  readonly prefixes: Pick<ErrorPrefixRegistryBucket, "values">;
  /** Read-only view of pattern definitions. */
  readonly patterns: Pick<ErrorPatternRegistryBucket, "values">;
}
