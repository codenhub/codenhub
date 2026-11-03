import { capture, failureEvent } from "./errors";
import { localStorageDriver } from "./local-storage-driver";
import { SET_STORAGE_KEY } from "./types";
import type { CreateStoreOptions, RemovableStoreKey, Store } from "./types";

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

  const driver = options.driver ?? localStorageDriver<TSchema>(storageKey);
  const { onError } = options;
  driver[SET_STORAGE_KEY]?.(storageKey);

  const readState = (): { state: TSchema; readFailed: boolean } => {
    const result = capture(() => driver.get());
    if (!result.ok) {
      const isParseError = result.cause instanceof SyntaxError;
      onError?.(failureEvent(isParseError ? "store.parse_failed" : "store.read_failed", storageKey, result.cause));
      return { state: structuredClone(initialState), readFailed: !isParseError };
    }
    const parsed = result.value;
    if (parsed === null || parsed === undefined) {
      return { state: structuredClone(initialState), readFailed: false };
    }
    if (options.validate !== undefined && !options.validate(parsed)) {
      options.onError?.(failureEvent("store.validation_failed", storageKey));
      return { state: structuredClone(initialState), readFailed: false };
    }
    return { state: structuredClone(parsed as TSchema), readFailed: false };
  };

  const writeState = (state: TSchema): boolean => {
    const result = capture(() => driver.set(state));
    if (!result.ok || !result.value) {
      onError?.(failureEvent("store.write_failed", storageKey, result.ok ? undefined : result.cause));
      return false;
    }
    return true;
  };

  return {
    get(): TSchema {
      return readState().state;
    },
    set(nextState: TSchema): boolean {
      return writeState(nextState);
    },
    patch(partialState: Partial<TSchema>): TSchema {
      const { state, readFailed } = readState();
      if (readFailed) {
        return state;
      }
      const nextState = { ...state, ...partialState };
      writeState(nextState);
      return structuredClone(nextState);
    },
    getItem<TKey extends keyof TSchema>(key: TKey): TSchema[TKey] | undefined {
      return readState().state[key];
    },
    setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): TSchema {
      const { state, readFailed } = readState();
      if (readFailed) {
        return state;
      }
      const nextState = { ...state, [key]: value } as TSchema;
      writeState(nextState);
      return structuredClone(nextState);
    },
    removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): TSchema {
      const { state, readFailed } = readState();
      if (readFailed) {
        return state;
      }
      delete state[key];
      writeState(state);
      return structuredClone(state);
    },
    clear(): void {
      if (!driver.clear) {
        onError?.(failureEvent("store.clear_unsupported", storageKey));
        return;
      }
      const result = capture(() => driver.clear!());
      if (!result.ok) {
        onError?.(failureEvent("store.clear_failed", storageKey, result.cause));
      }
    },
  };
}
