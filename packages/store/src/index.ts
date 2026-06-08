type OptionalKeys<TSchema extends object> = {
  [TKey in keyof TSchema]-?: object extends Pick<TSchema, TKey> ? TKey : never;
}[keyof TSchema];

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
   * When storage is empty or invalid, the store falls back to the initial state.
   *
   * @returns Current state object.
   */
  get(): TSchema;

  /**
   * Replaces the full persisted state.
   *
   * @param nextState - Full next state to persist.
   * @returns `true` if the state was successfully persisted, `false` otherwise.
   */
  set(nextState: TSchema): boolean;

  /**
   * Merges a partial object into the current state and persists the result.
   *
   * @param partialState - Partial state fields to merge.
   * @returns The merged and persisted state.
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
   * Sets a single typed value, persists it, and returns the next state.
   *
   * @typeParam TKey - Key of the target field in the schema.
   * @param key - Field name to write.
   * @param value - Typed value for the field.
   * @returns Updated and persisted state.
   */
  setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema;

  /**
   * Removes a key from the state object, persists, and returns the next state.
   *
   * @typeParam TKey - Key of the target field in the schema.
   * @param key - Field name to remove.
   * @returns Updated and persisted state.
   */
  removeItem<TKey extends OptionalKeys<TSchema>>(key: TKey): TSchema;

  /**
   * Removes the stored entry for this store key from localStorage.
   *
   * After clearing, subsequent reads return the initial state.
   */
  clear(): void;
}

/**
 * Options for configuring a store instance.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 */
export interface StoreOptions<TSchema extends object> {
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
}

/**
 * Creates a simple, strictly typed localStorage store for a module.
 *
 * If storage is empty or contains invalid JSON, reads fall back to `initialState`.
 * If a `validate` option is provided, stored values that fail the check are also
 * discarded and the store falls back to `initialState`.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param storageKey - localStorage key used to persist the store.
 * @param initialState - Fallback state used when nothing valid is stored.
 * @param options - Optional configuration for the store instance.
 * @returns A typed store instance bound to the provided key.
 */
export function createStore<TSchema extends object>(
  storageKey: string,
  initialState: TSchema,
  options: StoreOptions<TSchema> = {},
): Store<TSchema> {
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
        console.warn(`[Store] Failed to read from localStorage for key "${storageKey}":`, error);
      }
    }

    if (raw === null) {
      return structuredClone(initialState);
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      if (options.validate !== undefined && !options.validate(parsed)) {
        console.warn(
          `[Store] Stored value for key "${storageKey}" failed schema validation. Falling back to initial state.`,
        );
        return structuredClone(initialState);
      }

      return structuredClone(parsed as TSchema);
    } catch (error) {
      console.warn(`[Store] Failed to parse stored JSON for key "${storageKey}":`, error);
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
      console.warn(`[Store] Failed to write to localStorage for key "${storageKey}":`, error);
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
    removeItem<TKey extends OptionalKeys<TSchema>>(key: TKey): TSchema {
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
        console.warn(`[Store] Failed to clear localStorage for key "${storageKey}":`, error);
      }
    },
  };
}
