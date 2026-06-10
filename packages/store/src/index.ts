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
   * Removes the stored entry for this store key from localStorage.
   *
   * After clearing, subsequent reads return the initial state. If storage is unavailable,
   * the method does nothing; if removal fails, it reports the failure through
   * `CreateStoreOptions.onError` when provided.
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
   * localStorage key used to persist this store.
   */
  storageKey: string;

  /**
   * Fallback state snapshotted at store creation and returned when storage is empty, unavailable, invalid, or rejected by `validate`.
   */
  initialState: TSchema;

  /**
   * Optional runtime validator for parsed JSON.
   *
   * When provided, values from storage that fail this check are discarded
   * and the store falls back to `initialState`. This bridges the gap between
   * TypeScript's compile-time safety and runtime schema correctness, guarding
   * against stale or externally written values with an unexpected shape.
   *
   * @param raw - The parsed JSON value (typed as `unknown`).
   * @returns `true` if the value matches the expected schema.
   */
  validate?: (raw: unknown) => raw is TSchema;

  /**
   * Optional hook for recoverable storage, parsing, and validation failures.
   *
   * The store does not log by default. Use this hook for diagnostics, telemetry,
   * user feedback, or app-owned error normalization.
   *
   * @param error - Store-owned error event with a stable code, storage key, message, and optional cause.
   */
  onError?: (error: StoreErrorEvent) => void;
}

/**
 * Creates a simple, strictly typed localStorage store for a module.
 *
 * The initial state is snapshotted at creation so later caller mutations do not
 * affect fallback reads. If storage is empty or contains invalid JSON, reads fall
 * back to that snapshot.
 * If a `validate` option is provided, stored values that fail the check are also
 * discarded and the store falls back to the initial-state snapshot.
 * Store creation throws if `structuredClone` is unavailable or the initial state
 * is not structured-cloneable.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param options - Configuration for the store instance, including storage key, initial state, and optional validation.
 * @returns A typed store instance bound to the provided key.
 * @throws When the initial state cannot be cloned with `structuredClone`.
 */
export function createStore<TSchema extends object>(options: CreateStoreOptions<TSchema>): Store<TSchema> {
  const { storageKey } = options;
  const initialState = structuredClone(options.initialState);

  const reportError = (error: StoreErrorEvent): void => {
    options.onError?.(error);
  };

  const isStorageAvailable = (): boolean => {
    try {
      return typeof localStorage !== "undefined" && localStorage !== null;
    } catch {
      return false;
    }
  };

  const readState = (): TSchema => {
    let raw: string | null = null;

    if (isStorageAvailable()) {
      try {
        raw = localStorage.getItem(storageKey);
      } catch (error) {
        reportError({
          code: "storage-read-failed",
          message: `Failed to read from localStorage for key "${storageKey}".`,
          storageKey,
          cause: error,
        });
      }
    }

    if (raw === null) {
      return structuredClone(initialState);
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      if (options.validate !== undefined && !options.validate(parsed)) {
        reportError({
          code: "storage-validation-failed",
          message: `Stored value for key "${storageKey}" failed schema validation.`,
          storageKey,
        });
        return structuredClone(initialState);
      }

      return structuredClone(parsed as TSchema);
    } catch (error) {
      reportError({
        code: "storage-parse-failed",
        message: `Failed to parse stored JSON for key "${storageKey}".`,
        storageKey,
        cause: error,
      });
      return structuredClone(initialState);
    }
  };

  const writeState = (state: TSchema): boolean => {
    if (!isStorageAvailable()) {
      return false;
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      return true;
    } catch (error) {
      reportError({
        code: "storage-write-failed",
        message: `Failed to write to localStorage for key "${storageKey}".`,
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
      if (!isStorageAvailable()) {
        return;
      }

      try {
        localStorage.removeItem(storageKey);
      } catch (error) {
        reportError({
          code: "storage-clear-failed",
          message: `Failed to clear localStorage for key "${storageKey}".`,
          storageKey,
          cause: error,
        });
      }
    },
  };
}
