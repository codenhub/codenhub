import { SET_STORAGE_KEY } from "./types";
import type { AsyncStorageDriver, StorageDriver } from "./types";

/**
 * In-memory synchronous driver.
 *
 * Stores state in a local variable. Useful for testing, environments without storage APIs,
 * or server-side rendering fallback. Values are copied with `structuredClone`, which preserves
 * more types than JSON; portable records still need JSON-safe values.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @returns A synchronous storage driver.
 * @throws {DOMException} A get or set throws DataCloneError for non-cloneable values.
 * @throws {Error} Key binding throws when sharing the driver across different keys.
 */
export function memoryDriver<TSchema extends object>(): StorageDriver<TSchema> {
  let data: unknown = null;
  let key: string | undefined;
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
    [SET_STORAGE_KEY](k: string) {
      if (key !== undefined && key !== k) {
        throw new Error(
          `Driver instance cannot be shared across stores with different keys (already bound to "${key}", tried to bind to "${k}").`,
        );
      }
      key = k;
    },
  };
}

/**
 * In-memory asynchronous driver.
 *
 * Stores state in a local variable. Useful for testing, environments without storage APIs,
 * or server-side rendering fallback. Values are copied with `structuredClone`, which preserves
 * more types than JSON; portable records still need JSON-safe values.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @returns An asynchronous storage driver.
 * @throws {DOMException} A get or set rejects with DataCloneError for non-cloneable values.
 * @throws {Error} Key binding throws when sharing the driver across different keys.
 */
export function asyncMemoryDriver<TSchema extends object>(): AsyncStorageDriver<TSchema> {
  let data: unknown = null;
  let key: string | undefined;
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
    [SET_STORAGE_KEY](k: string) {
      if (key !== undefined && key !== k) {
        throw new Error(
          `Driver instance cannot be shared across stores with different keys (already bound to "${key}", tried to bind to "${k}").`,
        );
      }
      key = k;
    },
  };
}
