/** @internal */
type OptionalKeys<TSchema extends object> = {
  [TKey in keyof TSchema]-?: object extends Pick<TSchema, TKey> ? TKey : never;
}[keyof TSchema];

/** Stable identifiers for recoverable store failures and {@link storeErrors} feedback. */
export type StoreErrorCode =
  | "store.read_failed"
  | "store.write_failed"
  | "store.clear_failed"
  | "store.clear_unsupported"
  | "store.parse_failed"
  | "store.validation_failed";

/** Recoverable store failure reported through `CreateStoreOptions.onError`. */
export interface StoreErrorEvent {
  /** Stable error code describing which storage operation failed. */
  code: StoreErrorCode;
  /** Human-readable diagnostic message safe for logs or developer tooling. */
  message: string;
  /** Storage key associated with the failed operation. */
  storageKey: string;
  /** Original thrown value when the failure came from an exception. */
  cause?: unknown;
}

/**
 * Keys that can be removed from a store without violating the schema shape.
 *
 * Required schema keys are excluded so `removeItem()` cannot create an invalid state object.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export type RemovableStoreKey<TSchema extends object> = OptionalKeys<TSchema>;

/**
 * Symbol for the optional driver hook that binds a store's storage key.
 *
 * Custom drivers may implement this hook when they need the key supplied to
 * `createStore` or `createAsyncStore`. The store calls it during creation;
 * implementations should reject attempts to bind one driver to different keys.
 */
export const SET_STORAGE_KEY = Symbol.for("store:set_storage_key");

/**
 * Interface for a synchronous storage driver.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface StorageDriver<TSchema extends object> {
  /** Reads and returns the stored value, or null if not found. */
  get(): unknown;
  /**
   * Persists the value. Returns true if successful, false if writing is disabled/unavailable,
   * or throws an error on system failures (which will be caught and reported by the store).
   */
  set(value: TSchema): boolean;
  /** Removes the stored value; omitting this reports `store.clear_unsupported` when the store clears. */
  clear?(): void;
  /** Optional hook called during store creation to bind the driver's storage key. */
  [SET_STORAGE_KEY]?(key: string): void;
}

/**
 * Typed small-record store API.
 *
 * Each store instance stores one whole object under its `storageKey`. Last write wins;
 * queries, transactions, and cross-process coordination are outside this API.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface Store<TSchema extends object> {
  /**
   * Returns the full persisted state.
   *
   * When storage is empty, unavailable, unreadable, invalid JSON, or rejected by `validate`,
   * the store falls back to a clone of the initial state. Recoverable read, parse, and validation
   * failures are reported through `CreateStoreOptions.onError` when provided.
   * Unavailable localStorage reads fall back silently.
   *
   * @returns A deep clone of the current state object.
   */
  get(): TSchema;

  /**
   * Replaces the full persisted state.
   *
   * @param nextState - Full next state to persist.
   * @returns `true` if the state was successfully persisted; `false` when storage is unavailable or writing fails.
   */
  set(nextState: TSchema): boolean;

  /**
   * Merges partial updates into the current state and attempts to persist the result.
   *
   * If writing to the storage driver fails, the merged state is still returned by the method call,
   * but subsequent reads will reflect the old state from the storage driver. The failure is
   * reported to `CreateStoreOptions.onError`.
   *
   * A driver read failure skips the write and returns a clone of initial state. Parse and
   * validation failures still allow overwriting the corrupt record with fallback plus changes.
   *
   * @param partialState - A partial object containing the fields to update.
   * @returns A deep clone of the merged state, or initial state when the driver read fails.
   */
  patch(partialState: Partial<TSchema>): TSchema;

  /**
   * Retrieves a single field's value from the current store state.
   *
   * Reads, parses (for JSON drivers), and clones the whole record. Batch changes with `patch`.
   * Corrupt data reports an error and falls back; unavailable localStorage falls back silently.
   *
   * @typeParam TKey - Union of keys in the schema.
   * @param key - The field name to retrieve.
   * @returns The value of the field if present; otherwise, `undefined`.
   */
  getItem<TKey extends keyof TSchema>(key: TKey): TSchema[TKey] | undefined;

  /**
   * Updates a single field in the store state and attempts to persist the changes.
   *
   * If writing to the storage driver fails, the updated state is still returned by the method call,
   * but subsequent reads will reflect the old state from the storage driver. The failure is
   * reported to `CreateStoreOptions.onError`.
   *
   * A driver read failure skips the write and returns a clone of initial state. Parse and
   * validation failures still allow overwriting the corrupt record with fallback plus changes.
   *
   * @typeParam TKey - Union of keys in the schema.
   * @param key - The field name to update.
   * @param value - The new value to assign to the field.
   * @returns A deep clone of the updated state, or initial state when the driver read fails.
   */
  setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema;

  /**
   * Deletes an optional field from the store state and attempts to persist the changes.
   *
   * Only optional keys can be removed to prevent producing a state object that violates the schema.
   * If writing to the storage driver fails, the updated state is still returned by the method call,
   * but subsequent reads will reflect the old state from the storage driver. The failure is
   * reported to `CreateStoreOptions.onError`.
   *
   * A driver read failure skips the write and returns a clone of initial state. Parse and
   * validation failures still allow overwriting the corrupt record with fallback plus changes.
   *
   * @typeParam TKey - Union of optional keys in the schema.
   * @param key - The optional field name to delete.
   * @returns A deep clone without the removed field, or initial state when the driver read fails.
   */
  removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): TSchema;

  /**
   * Clears the persisted entry from storage.
   *
   * Subsequent reads fall back only if removal succeeds. A failure reports `store.clear_failed`;
   * a driver without clear reports `store.clear_unsupported` and leaves the record in place.
   */
  clear(): void;
}

/**
 * Options for creating a store instance.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface CreateStoreOptions<TSchema extends object> {
  /**
   * Storage key used to identify the stored state.
   */
  storageKey: string;

  /**
   * Fallback state snapshotted at store creation and returned when storage is empty, unavailable, invalid, or rejected by `validate`.
   */
  initialState: TSchema;

  /**
   * Custom storage driver. Defaults to `localStorageDriver`.
   */
  driver?: StorageDriver<TSchema>;

  /**
   * Optional runtime validator for parsed JSON. A stored value that is not an object is
   * rejected as `store.validation_failed` before this runs.
   *
   * @param raw - The parsed value (typed as `unknown`).
   * @returns `true` if the value matches the expected schema.
   */
  validate?: (raw: unknown) => raw is TSchema;

  /**
   * Optional hook for recoverable storage, parsing, validation, and unsupported-clear failures.
   * Exceptions thrown by this callback propagate without being recovered or reported again.
   *
   * @param error - Store-owned error event with a stable code, storage key, message, and optional cause.
   */
  onError?: (error: StoreErrorEvent) => void;
}

/**
 * Interface for an asynchronous storage driver.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface AsyncStorageDriver<TSchema extends object> {
  /** Reads and returns the stored value, or null if not found. */
  get(): Promise<unknown>;
  /**
   * Persists the value. Returns true if successful, false if writing is disabled/unavailable,
   * or rejects with an error on system failures (which will be caught and reported by the store).
   */
  set(value: TSchema): Promise<boolean>;
  /** Removes the stored value; omitting this reports `store.clear_unsupported` when the store clears. */
  clear?(): Promise<void>;
  /** Optional hook called during store creation to bind the driver's storage key. */
  [SET_STORAGE_KEY]?(key: string): void;
}

/**
 * Typed asynchronous store API.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface AsyncStore<TSchema extends object> {
  /**
   * Retrieves the full persisted state asynchronously.
   *
   * Falls back to a clone of the initial state if storage is empty, corrupt, or unreadable.
   * Failure to read, parse, or validate is reported to `CreateAsyncStoreOptions.onError`.
   *
   * @returns A promise resolving to a deep clone of the current state object.
   */
  get(): Promise<TSchema>;

  /**
   * Replaces the entire persisted state asynchronously.
   * Inputs are cloned at call time before queueing, as with `patch` and `setItem`.
   *
   * @param nextState - The new full state object.
   * @returns A promise resolving to `true` if successful; `false` if the write failed. Failure is reported to `CreateAsyncStoreOptions.onError`.
   */
  set(nextState: TSchema): Promise<boolean>;

  /**
   * Merges partial updates into the current state asynchronously and attempts to persist the result.
   *
   * If the write operation fails, the merged state is still returned, and the failure is reported
   * to `CreateAsyncStoreOptions.onError`.
   *
   * A driver read failure skips the write and returns a clone of initial state. Parse and
   * validation failures still allow overwriting the corrupt record with fallback plus changes.
   *
   * Inputs are cloned at call time before queueing.
   *
   * @param partialState - A partial object containing the fields to update.
   * @returns A promise resolving to a deep clone of the merged state, or initial state when the driver read fails.
   */
  patch(partialState: Partial<TSchema>): Promise<TSchema>;

  /**
   * Retrieves a single field's value from the persisted state asynchronously.
   *
   * Reads, parses (for JSON drivers), and clones the whole record. Batch changes with `patch`.
   * Read, parse, and validation failures report an error and fall back to initial state.
   *
   * @typeParam TKey - Union of keys in the schema.
   * @param key - The field name to retrieve.
   * @returns A promise resolving to the field's value, or `undefined` if not found.
   */
  getItem<TKey extends keyof TSchema>(key: TKey): Promise<TSchema[TKey] | undefined>;

  /**
   * Updates a single field in the store state asynchronously and attempts to persist the changes.
   *
   * If the write operation fails, the updated state is still returned, and the failure is reported
   * to `CreateAsyncStoreOptions.onError`.
   *
   * A driver read failure skips the write and returns a clone of initial state. Parse and
   * validation failures still allow overwriting the corrupt record with fallback plus changes.
   *
   * The value is cloned at call time before queueing.
   *
   * @typeParam TKey - Union of keys in the schema.
   * @param key - The field name to update.
   * @param value - The new value to assign to the field.
   * @returns A promise resolving to a deep clone of the updated state, or initial state when the driver read fails.
   */
  setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): Promise<TSchema>;

  /**
   * Deletes an optional field from the store state asynchronously and attempts to persist the changes.
   *
   * Only optional keys can be removed. If the write operation fails, the updated state is still returned,
   * and the failure is reported to `CreateAsyncStoreOptions.onError`.
   *
   * A driver read failure skips the write and returns a clone of initial state. Parse and
   * validation failures still allow overwriting the corrupt record with fallback plus changes.
   *
   * @typeParam TKey - Union of optional keys in the schema.
   * @param key - The optional field name to delete.
   * @returns A promise resolving to a clone without the removed field, or initial state when the driver read fails.
   */
  removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): Promise<TSchema>;

  /**
   * Clears the persisted entry from storage asynchronously.
   *
   * Subsequent reads fall back only if removal succeeds. A failure reports `store.clear_failed`;
   * a driver without clear reports `store.clear_unsupported` and leaves the record in place.
   *
   * @returns A promise resolving when the clear operation completes.
   */
  clear(): Promise<void>;
}

/**
 * Options for creating an asynchronous store instance.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface CreateAsyncStoreOptions<TSchema extends object> {
  /**
   * Storage key used to identify the stored state.
   */
  storageKey: string;

  /**
   * Fallback state snapshotted at store creation and returned when storage is empty, unavailable, invalid, or rejected by `validate`.
   */
  initialState: TSchema;

  /**
   * Asynchronous storage driver.
   */
  driver: AsyncStorageDriver<TSchema>;

  /**
   * Optional runtime validator for parsed JSON. A stored value that is not an object is
   * rejected as `store.validation_failed` before this runs.
   *
   * @param raw - The parsed value (typed as `unknown`).
   * @returns `true` if the value matches the expected schema.
   */
  validate?: (raw: unknown) => raw is TSchema;

  /**
   * Optional hook for recoverable storage, parsing, validation, and unsupported-clear failures.
   * Exceptions thrown by this callback propagate without being recovered or reported again.
   *
   * @param error - Store-owned error event with a stable code, storage key, message, and optional cause.
   */
  onError?: (error: StoreErrorEvent) => void;
}
