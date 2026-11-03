import { captureAsync, failureEvent } from "./errors";
import { SET_STORAGE_KEY } from "./types";
import type { AsyncStore, CreateAsyncStoreOptions, RemovableStoreKey } from "./types";

// Clones caller input at call time; a clone failure rejects instead of throwing synchronously.
function snapshotThen<T, R>(value: T, run: (snapshot: T) => Promise<R>): Promise<R> {
  let snapshot: T;
  try {
    snapshot = structuredClone(value);
  } catch (error) {
    return Promise.reject(error);
  }
  return run(snapshot);
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

  if (driver[SET_STORAGE_KEY]) {
    driver[SET_STORAGE_KEY](storageKey);
  }

  const queue = new AsyncQueue();

  const readState = async (): Promise<{
    state: TSchema;
    readFailed: boolean;
  }> => {
    const result = await captureAsync(() => driver.get());
    if (!result.ok) {
      const isParseError = result.cause instanceof SyntaxError;
      options.onError?.(
        failureEvent(isParseError ? "store.parse_failed" : "store.read_failed", storageKey, result.cause),
      );
      return {
        state: structuredClone(initialState),
        readFailed: !isParseError,
      };
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

  const writeState = async (state: TSchema): Promise<boolean> => {
    const result = await captureAsync(() => driver.set(state));
    if (!result.ok || !result.value) {
      options.onError?.(failureEvent("store.write_failed", storageKey, result.ok ? undefined : result.cause));
      return false;
    }
    return true;
  };

  return {
    get(): Promise<TSchema> {
      return queue.run(async () => (await readState()).state);
    },
    set(nextState: TSchema): Promise<boolean> {
      return snapshotThen(nextState, (snapshot) => queue.run(() => writeState(snapshot)));
    },
    patch(partialState: Partial<TSchema>): Promise<TSchema> {
      return snapshotThen(partialState, (snapshot) =>
        queue.run(async () => {
          const { state, readFailed } = await readState();
          if (readFailed) {
            return state;
          }
          const nextState = { ...state, ...snapshot };
          await writeState(nextState);
          return structuredClone(nextState);
        }),
      );
    },
    getItem<TKey extends keyof TSchema>(key: TKey): Promise<TSchema[TKey] | undefined> {
      return queue.run(async () => (await readState()).state[key]);
    },
    setItem<TKey extends keyof TSchema>(key: TKey, value: TSchema[TKey]): Promise<TSchema> {
      return snapshotThen(value, (snapshot) =>
        queue.run(async () => {
          const { state, readFailed } = await readState();
          if (readFailed) {
            return state;
          }
          const nextState = { ...state, [key]: snapshot } as TSchema;
          await writeState(nextState);
          return structuredClone(nextState);
        }),
      );
    },
    removeItem<TKey extends RemovableStoreKey<TSchema>>(key: TKey): Promise<TSchema> {
      return queue.run(async () => {
        const { state, readFailed } = await readState();
        if (readFailed) {
          return state;
        }
        delete state[key];
        await writeState(state);
        return structuredClone(state);
      });
    },
    clear(): Promise<void> {
      return queue.run(async () => {
        if (!driver.clear) {
          options.onError?.(failureEvent("store.clear_unsupported", storageKey));
          return;
        }
        const result = await captureAsync(() => driver.clear!());
        if (!result.ok) {
          options.onError?.(failureEvent("store.clear_failed", storageKey, result.cause));
        }
      });
    },
  };
}
