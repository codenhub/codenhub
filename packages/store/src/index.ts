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
  get(): unknown | null;
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
   * the store falls back to the initial state. Recoverable read, parse, and validation
   * failures are reported through `CreateStoreOptions.onError` when provided.
   *
   * @returns Current state object.
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
   * Merges a partial object into the current state and attempts to persist the result.
   *
   * @param partialState - Partial state fields to merge.
   * @returns The merged state, even when persistence fails and later reads may not include the merge.
   */
  patch(partialState: Partial<TSchema>): TSchema;

  /**
   * Returns a single typed value from the current state.
   *
   * @typeParam TKey - Key of the target field in the schema.
   * @param key - Field name to read.
   * @returns Field value, or `undefined` when the key is missing.
   */
  getItem<TKey extends keyof TSchema>(key: TKey): TSchema[TKey] | undefined;

  /**
   * Sets a single typed value, attempts to persist it, and returns the next state.
   *
   * @typeParam TKey - Key of the target field in the schema.
   * @param key - Field name to write.
   * @param value - Typed value for the field.
   * @returns Updated state, even when persistence fails and later reads may not include the change.
   */
  setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema;

  /**
   * Removes a key from the state object, attempts to persist, and returns the next state.
   *
   * @typeParam TKey - Key of the target field in the schema.
   * @param key - Field name to remove.
   * @returns Updated state, even when persistence fails and later reads may not include the removal.
   */
  removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): TSchema;

  /**
   * Removes the stored entry for this store key.
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
 */
export function localStorageDriver<TSchema extends object>(
  storageKey: string,
  onError?: (error: StoreErrorEvent) => void,
): StorageDriver<TSchema> {
  const isStorageAvailable = (): boolean => {
    try {
      return typeof localStorage !== "undefined" && localStorage !== null;
    } catch {
      return false;
    }
  };

  return {
    get(): unknown | null {
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
 * In-memory synchronous driver. Useful for testing or server-side rendering fallback.
 */
export function memoryDriver<TSchema extends object>(): StorageDriver<TSchema> {
  let data: unknown | null = null;
  return {
    get(): unknown | null {
      return data;
    },
    set(value: TSchema): boolean {
      data = value;
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
 */
export function createStore<TSchema extends object>(options: CreateStoreOptions<TSchema>): Store<TSchema> {
  const { storageKey } = options;
  const initialState = structuredClone(options.initialState);

  const reportError = (error: StoreErrorEvent): void => {
    options.onError?.(error);
  };

  const driver = options.driver ?? localStorageDriver<TSchema>(storageKey, reportError);

  const readState = (): TSchema => {
    let parsed: unknown = null;
    try {
      parsed = driver.get();
    } catch (error) {
      reportError({
        code: "storage-read-failed",
        message: `Driver failed to read value for key "${storageKey}".`,
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
      return nextState;
    },
    getItem<TKey extends keyof TSchema>(key: TKey): TSchema[TKey] | undefined {
      return readState()[key];
    },
    setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema {
      const nextState = { ...readState(), [key]: value } as TSchema;
      writeState(nextState);
      return nextState;
    },
    removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): TSchema {
      const currentState = readState();
      const nextState = { ...currentState };
      delete nextState[key];
      writeState(nextState);
      return nextState;
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
  get(): Promise<unknown | null> | unknown | null;
  /** Persists the value. Returns true if successful, false otherwise. */
  set(value: TSchema): Promise<boolean> | boolean;
  /** Removes the stored value. */
  clear?(): Promise<void> | void;
}

/**
 * Typed asynchronous store API.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface AsyncStore<TSchema extends object> {
  /** Returns the full persisted state. */
  get(): Promise<TSchema>;
  /** Replaces the full persisted state. */
  set(nextState: TSchema): Promise<boolean>;
  /** Merges a partial object into the current state and attempts to persist the result. */
  patch(partialState: Partial<TSchema>): Promise<TSchema>;
  /** Returns a single typed value from the current state. */
  getItem<TKey extends keyof TSchema>(key: TKey): Promise<TSchema[TKey] | undefined>;
  /** Sets a single typed value, attempts to persist it, and returns the next state. */
  setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): Promise<TSchema>;
  /** Removes a key from the state object, attempts to persist, and returns the next state. */
  removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): Promise<TSchema>;
  /** Removes the stored entry for this store key. */
  clear(): Promise<void>;
}

/**
 * Options for creating an asynchronous store instance.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface CreateAsyncStoreOptions<TSchema extends object> {
  /** Storage key used to identify the stored state. */
  storageKey: string;
  /** Fallback state snapshotted at store creation and returned when storage is empty or fails. */
  initialState: TSchema;
  /** Asynchronous storage driver. */
  driver: AsyncStorageDriver<TSchema>;
  /** Optional runtime validator for parsed JSON. */
  validate?: (raw: unknown) => raw is TSchema;
  /** Optional hook for recoverable storage, parsing, and validation failures. */
  onError?: (error: StoreErrorEvent) => void;
}

/**
 * Creates a strictly typed asynchronous store.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param options - Configuration for the store instance.
 * @returns An asynchronous typed store instance.
 */
export function createAsyncStore<TSchema extends object>(
  options: CreateAsyncStoreOptions<TSchema>,
): AsyncStore<TSchema> {
  const { storageKey, driver } = options;
  const initialState = structuredClone(options.initialState);

  const reportError = (error: StoreErrorEvent): void => {
    options.onError?.(error);
  };

  const readState = async (): Promise<TSchema> => {
    let parsed: unknown = null;
    try {
      parsed = await driver.get();
    } catch (error) {
      reportError({
        code: "storage-read-failed",
        message: `Driver failed to read value for key "${storageKey}".`,
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
    async get(): Promise<TSchema> {
      return readState();
    },
    async set(nextState: TSchema): Promise<boolean> {
      return writeState(nextState);
    },
    async patch(partialState: Partial<TSchema>): Promise<TSchema> {
      const currentState = await readState();
      const nextState = { ...currentState, ...partialState };
      await writeState(nextState);
      return nextState;
    },
    async getItem<TKey extends keyof TSchema>(key: TKey): Promise<TSchema[TKey] | undefined> {
      const state = await readState();
      return state[key];
    },
    async setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): Promise<TSchema> {
      const currentState = await readState();
      const nextState = { ...currentState, [key]: value } as TSchema;
      await writeState(nextState);
      return nextState;
    },
    async removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): Promise<TSchema> {
      const currentState = await readState();
      const nextState = { ...currentState };
      delete nextState[key];
      await writeState(nextState);
      return nextState;
    },
    async clear(): Promise<void> {
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
    },
  };
}

/**
 * In-memory asynchronous driver. Useful for testing or server-side rendering fallback.
 */
export function asyncMemoryDriver<TSchema extends object>(): AsyncStorageDriver<TSchema> {
  let data: unknown | null = null;
  return {
    async get(): Promise<unknown | null> {
      return data;
    },
    async set(value: TSchema): Promise<boolean> {
      data = value;
      return true;
    },
    async clear(): Promise<void> {
      data = null;
    },
  };
}
