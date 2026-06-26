/** @internal */
type OptionalKeys<TSchema extends object> = {
  [TKey in keyof TSchema]-?: object extends Pick<TSchema, TKey> ? TKey : never;
}[keyof TSchema];

/** Recoverable store failure reported through `CreateStoreOptions.onError`. */
export interface StoreErrorEvent {
  /** Stable error code describing which storage operation failed. */
  code:
    | "storage-read-failed"
    | "storage-write-failed"
    | "storage-clear-failed"
    | "storage-parse-failed"
    | "storage-validation-failed";
  /** Human-readable diagnostic message safe for logs or developer tooling. */
  message: string;
  /** localStorage key associated with the failed operation. */
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
 * Interface for a synchronous storage driver.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface StorageDriver<TSchema extends object> {
  /** Reads and returns the stored value, or null if not found. */
  get(): unknown;
  /** Persists the value. Returns true if successful, false otherwise. */
  set(value: TSchema): boolean;
  /** Removes the stored value. */
  clear?(): void;
}

/**
 * Typed localStorage-backed store API.
 *
 * Each store instance is scoped by its own `storageKey` and schema type.
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
   * If writing to the storage driver fails, the merged state is still returned and kept in memory,
   * but the failure is reported to `CreateStoreOptions.onError`.
   *
   * @param partialState - A partial object containing the fields to update.
   * @returns A deep clone of the merged state object.
   */
  patch(partialState: Partial<TSchema>): TSchema;

  /**
   * Retrieves a single field's value from the current store state.
   *
   * Under the hood, this reads the entire state object. If storage is unavailable or corrupt,
   * the store falls back to the initial state and reports the failure via `CreateStoreOptions.onError`.
   *
   * @typeParam TKey - Union of keys in the schema.
   * @param key - The field name to retrieve.
   * @returns The value of the field if present; otherwise, `undefined`.
   */
  getItem<TKey extends keyof TSchema>(key: TKey): TSchema[TKey] | undefined;

  /**
   * Updates a single field in the store state and attempts to persist the changes.
   *
   * If writing to the storage driver fails, the updated state is still returned and kept in memory,
   * but the failure is reported to `CreateStoreOptions.onError`.
   *
   * @typeParam TKey - Union of keys in the schema.
   * @param key - The field name to update.
   * @param value - The new value to assign to the field.
   * @returns A deep clone of the updated full state object.
   */
  setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema;

  /**
   * Deletes an optional field from the store state and attempts to persist the changes.
   *
   * Only optional keys can be removed to prevent producing a state object that violates the schema.
   * If writing to the storage driver fails, the updated state is still returned and kept in memory,
   * but the failure is reported to `CreateStoreOptions.onError`.
   *
   * @typeParam TKey - Union of optional keys in the schema.
   * @param key - The optional field name to delete.
   * @returns A deep clone of the updated full state object without the removed field.
   */
  removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): TSchema;

  /**
   * Clears the persisted entry from storage.
   *
   * Subsequent reads will fall back to the initial state. If clearing the storage driver fails,
   * the failure is reported to `CreateStoreOptions.onError`.
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
   * Optional runtime validator for parsed JSON.
   *
   * @param raw - The parsed value (typed as `unknown`).
   * @returns `true` if the value matches the expected schema.
   */
  validate?: (raw: unknown) => raw is TSchema;

  /**
   * Optional hook for recoverable storage, parsing, and validation failures.
   *
   * @param error - Store-owned error event with a stable code, storage key, message, and optional cause.
   */
  onError?: (error: StoreErrorEvent) => void;
}

/**
 * Default synchronous localStorage driver.
 *
 * Persists and reads values from the browser's `localStorage`.
 * If `localStorage` throws during read, write, or clear operations, this driver catches
 * the exception, reports it via the provided `onError` callback, and returns fallback values (null/false).
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param storageKey - The key under which state is saved in `localStorage`.
 * @param onError - Optional callback for reporting recoverable storage failures.
 * @returns A synchronous storage driver.
 */
const isStorageAvailable = (): boolean => {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
};

/**
 * Default synchronous localStorage driver.
 *
 * Persists and reads values from the browser's `localStorage`.
 * If `localStorage` throws during read, write, or clear operations, this driver catches
 * the exception, reports it via the provided `onError` callback, and returns fallback values (null/false).
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param storageKey - The key under which state is saved in `localStorage`.
 * @param onError - Optional callback for reporting recoverable storage failures.
 * @returns A synchronous storage driver.
 */
export function localStorageDriver<TSchema extends object>(
  storageKey: string,
  onError?: (error: StoreErrorEvent) => void,
): StorageDriver<TSchema> {
  return {
    get(): unknown {
      if (!isStorageAvailable()) {
        return null;
      }
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(storageKey);
      } catch (error) {
        onError?.({
          code: "storage-read-failed",
          message: `Failed to read from localStorage for key "${storageKey}".`,
          storageKey,
          cause: error,
        });
        return null;
      }

      if (raw === null) {
        return null;
      }

      try {
        return JSON.parse(raw);
      } catch (error) {
        onError?.({
          code: "storage-parse-failed",
          message: `Failed to parse stored JSON for key "${storageKey}".`,
          storageKey,
          cause: error,
        });
        return null;
      }
    },
    set(state: TSchema): boolean {
      if (!isStorageAvailable()) {
        return false;
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
        return true;
      } catch (error) {
        onError?.({
          code: "storage-write-failed",
          message: `Failed to write to localStorage for key "${storageKey}".`,
          storageKey,
          cause: error,
        });
        return false;
      }
    },
    clear(): void {
      if (!isStorageAvailable()) {
        return;
      }
      try {
        localStorage.removeItem(storageKey);
      } catch (error) {
        onError?.({
          code: "storage-clear-failed",
          message: `Failed to clear localStorage for key "${storageKey}".`,
          storageKey,
          cause: error,
        });
      }
    },
  };
}

/**
 * In-memory synchronous driver.
 *
 * Stores state in a local variable. Useful for testing, environments without storage APIs,
 * or server-side rendering fallback. Operations never throw.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @returns A synchronous storage driver.
 */
export function memoryDriver<TSchema extends object>(): StorageDriver<TSchema> {
  let data: unknown = null;
  return {
    get(): unknown {
      return data !== null ? structuredClone(data) : null;
    },
    set(value: TSchema): boolean {
      data = structuredClone(value);
      return true;
    },
    clear(): void {
      data = null;
    },
  };
}

/**
 * Creates a simple, strictly typed store.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param options - Configuration for the store instance.
 * @returns A typed store instance.
 * @throws If `structuredClone` is unavailable in the host environment or if the `initialState` cannot be cloned.
 */
export function createStore<TSchema extends object>(options: CreateStoreOptions<TSchema>): Store<TSchema> {
  const { storageKey } = options;
  const initialState = structuredClone(options.initialState);

  const reportError = (error: StoreErrorEvent): void => {
    options.onError?.(error);
  };

  const driver = options.driver ?? localStorageDriver<TSchema>(storageKey, reportError);

  if (driver && typeof (driver as { _setStorageKey?: (key: string) => void })._setStorageKey === "function") {
    (driver as unknown as { _setStorageKey: (key: string) => void })._setStorageKey(storageKey);
  }

  const readState = (): TSchema => {
    let parsed: unknown = null;
    try {
      parsed = driver.get();
    } catch (error) {
      const isParseError = error instanceof SyntaxError;
      reportError({
        code: isParseError ? "storage-parse-failed" : "storage-read-failed",
        message: isParseError
          ? `Failed to parse stored JSON for key "${storageKey}".`
          : `Driver failed to read value for key "${storageKey}".`,
        storageKey,
        cause: error,
      });
      return structuredClone(initialState);
    }

    if (parsed === null || parsed === undefined) {
      return structuredClone(initialState);
    }

    if (options.validate !== undefined && !options.validate(parsed)) {
      reportError({
        code: "storage-validation-failed",
        message: `Stored value for key "${storageKey}" failed schema validation.`,
        storageKey,
      });
      return structuredClone(initialState);
    }

    return structuredClone(parsed as TSchema);
  };

  const writeState = (state: TSchema): boolean => {
    try {
      return driver.set(state);
    } catch (error) {
      reportError({
        code: "storage-write-failed",
        message: `Driver failed to write value for key "${storageKey}".`,
        storageKey,
        cause: error,
      });
      return false;
    }
  };

  return {
    get(): TSchema {
      return readState();
    },
    set(nextState: TSchema): boolean {
      return writeState(nextState);
    },
    patch(partialState: Partial<TSchema>): TSchema {
      const nextState = { ...readState(), ...partialState };
      writeState(nextState);
      return structuredClone(nextState);
    },
    getItem<TKey extends keyof TSchema>(key: TKey): TSchema[TKey] | undefined {
      return readState()[key];
    },
    setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema {
      const nextState = { ...readState(), [key]: value } as TSchema;
      writeState(nextState);
      return structuredClone(nextState);
    },
    removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): TSchema {
      const currentState = readState();
      const nextState = { ...currentState };
      delete nextState[key];
      writeState(nextState);
      return structuredClone(nextState);
    },
    clear(): void {
      try {
        driver.clear?.();
      } catch (error) {
        reportError({
          code: "storage-clear-failed",
          message: `Driver failed to clear storage for key "${storageKey}".`,
          storageKey,
          cause: error,
        });
      }
    },
  };
}

/**
 * Interface for an asynchronous storage driver.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface AsyncStorageDriver<TSchema extends object> {
  /** Reads and returns the stored value, or null if not found. */
  get(): Promise<unknown> | unknown;
  /** Persists the value. Returns true if successful, false otherwise. */
  set(value: TSchema): Promise<boolean> | boolean;
  /** Removes the stored value. */
  clear?(): Promise<void> | void;
}

class AsyncQueue {
  private tail: Promise<unknown> = Promise.resolve();

  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    const previous = this.tail;
    const next = (async () => {
      try {
        await previous;
      } catch {
        // Suppress previous errors to avoid blocking the queue
      }
      return fn();
    })();
    this.tail = next;
    return next;
  }
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
   * @param partialState - A partial object containing the fields to update.
   * @returns A promise resolving to a deep clone of the merged full state object.
   */
  patch(partialState: Partial<TSchema>): Promise<TSchema>;

  /**
   * Retrieves a single field's value from the persisted state asynchronously.
   *
   * If storage is unavailable or corrupt, the store falls back to the initial state and reports
   * the failure via `CreateAsyncStoreOptions.onError`.
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
   * @typeParam TKey - Union of keys in the schema.
   * @param key - The field name to update.
   * @param value - The new value to assign to the field.
   * @returns A promise resolving to a deep clone of the updated full state object.
   */
  setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): Promise<TSchema>;

  /**
   * Deletes an optional field from the store state asynchronously and attempts to persist the changes.
   *
   * Only optional keys can be removed. If the write operation fails, the updated state is still returned,
   * and the failure is reported to `CreateAsyncStoreOptions.onError`.
   *
   * @typeParam TKey - Union of optional keys in the schema.
   * @param key - The optional field name to delete.
   * @returns A promise resolving to a deep clone of the updated full state object without the removed field.
   */
  removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): Promise<TSchema>;

  /**
   * Clears the persisted entry from storage asynchronously.
   *
   * Subsequent reads will fall back to the initial state. If clearing fails, the failure is reported
   * to `CreateAsyncStoreOptions.onError`.
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
   * Optional runtime validator for parsed JSON.
   *
   * @param raw - The parsed value (typed as `unknown`).
   * @returns `true` if the value matches the expected schema.
   */
  validate?: (raw: unknown) => raw is TSchema;

  /**
   * Optional hook for recoverable storage, parsing, and validation failures.
   *
   * @param error - Store-owned error event with a stable code, storage key, message, and optional cause.
   */
  onError?: (error: StoreErrorEvent) => void;
}

/**
 * Creates a strictly typed asynchronous store.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param options - Configuration for the store instance.
 * @returns An asynchronous typed store instance.
 * @throws If `structuredClone` is unavailable in the host environment or if the `initialState` cannot be cloned.
 */
export function createAsyncStore<TSchema extends object>(
  options: CreateAsyncStoreOptions<TSchema>,
): AsyncStore<TSchema> {
  const { storageKey, driver } = options;
  const initialState = structuredClone(options.initialState);

  const reportError = (error: StoreErrorEvent): void => {
    options.onError?.(error);
  };

  if (driver && typeof (driver as { _setStorageKey?: (key: string) => void })._setStorageKey === "function") {
    (driver as unknown as { _setStorageKey: (key: string) => void })._setStorageKey(storageKey);
  }

  const queue = new AsyncQueue();

  const readState = async (): Promise<TSchema> => {
    let parsed: unknown = null;
    try {
      parsed = await driver.get();
    } catch (error) {
      const isParseError = error instanceof SyntaxError;
      reportError({
        code: isParseError ? "storage-parse-failed" : "storage-read-failed",
        message: isParseError
          ? `Failed to parse stored JSON for key "${storageKey}".`
          : `Driver failed to read value for key "${storageKey}".`,
        storageKey,
        cause: error,
      });
      return structuredClone(initialState);
    }

    if (parsed === null || parsed === undefined) {
      return structuredClone(initialState);
    }

    if (options.validate !== undefined && !options.validate(parsed)) {
      reportError({
        code: "storage-validation-failed",
        message: `Stored value for key "${storageKey}" failed schema validation.`,
        storageKey,
      });
      return structuredClone(initialState);
    }

    return structuredClone(parsed as TSchema);
  };

  const writeState = async (state: TSchema): Promise<boolean> => {
    try {
      return await driver.set(state);
    } catch (error) {
      reportError({
        code: "storage-write-failed",
        message: `Driver failed to write value for key "${storageKey}".`,
        storageKey,
        cause: error,
      });
      return false;
    }
  };

  return {
    get(): Promise<TSchema> {
      return queue.run(() => readState());
    },
    set(nextState: TSchema): Promise<boolean> {
      return queue.run(() => writeState(nextState));
    },
    patch(partialState: Partial<TSchema>): Promise<TSchema> {
      return queue.run(async () => {
        const currentState = await readState();
        const nextState = { ...currentState, ...partialState };
        await writeState(nextState);
        return structuredClone(nextState);
      });
    },
    getItem<TKey extends keyof TSchema>(key: TKey): Promise<TSchema[TKey] | undefined> {
      return queue.run(async () => {
        const state = await readState();
        return state[key];
      });
    },
    setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): Promise<TSchema> {
      return queue.run(async () => {
        const currentState = await readState();
        const nextState = { ...currentState, [key]: value } as TSchema;
        await writeState(nextState);
        return structuredClone(nextState);
      });
    },
    removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): Promise<TSchema> {
      return queue.run(async () => {
        const currentState = await readState();
        const nextState = { ...currentState };
        delete nextState[key];
        await writeState(nextState);
        return structuredClone(nextState);
      });
    },
    clear(): Promise<void> {
      return queue.run(async () => {
        try {
          await driver.clear?.();
        } catch (error) {
          reportError({
            code: "storage-clear-failed",
            message: `Driver failed to clear storage for key "${storageKey}".`,
            storageKey,
            cause: error,
          });
        }
      });
    },
  };
}

/**
 * In-memory asynchronous driver.
 *
 * Stores state in a local variable. Useful for testing, environments without storage APIs,
 * or server-side rendering fallback. Operations never throw.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @returns An asynchronous storage driver.
 */
export function asyncMemoryDriver<TSchema extends object>(): AsyncStorageDriver<TSchema> {
  let data: unknown = null;
  return {
    async get(): Promise<unknown> {
      return data !== null ? structuredClone(data) : null;
    },
    async set(value: TSchema): Promise<boolean> {
      data = structuredClone(value);
      return true;
    },
    async clear(): Promise<void> {
      data = null;
    },
  };
}
