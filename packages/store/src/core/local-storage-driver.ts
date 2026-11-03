import { SET_STORAGE_KEY } from "./types";
import type { StorageDriver } from "./types";

// Probe actual localStorage access: catches SecurityError in cross-origin iframes
// and other environments where the property exists but throws on access.
let cachedLocalStorage: typeof localStorage | null = null;
let cachedAvailable = false;

const isStorageAvailable = (): boolean => {
  try {
    if (typeof localStorage === "undefined") {
      return false;
    }
    if (localStorage === cachedLocalStorage) {
      return cachedAvailable;
    }
    cachedLocalStorage = localStorage;
    localStorage.getItem("");
    cachedAvailable = true;
  } catch {
    cachedAvailable = false;
  }
  return cachedAvailable;
};

/**
 * Default synchronous localStorage driver.
 *
 * Persists and reads values from the browser's `localStorage`.
 * Availability is probed and cached for the current localStorage object.
 * If storage is inaccessible
 * (e.g. in a cross-origin iframe or private-browsing restriction), the operation returns
 * a silent fallback value (`null` / `false`); clears do nothing.
 * Per-key access and JSON parsing failures throw the original cause for the store to report.
 * Unavailable reads are silent; a store reports false writes through its `onError`.
 * Values must survive a JSON round-trip for portable persistence.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param storageKey - Optional key under which state is saved in `localStorage`. If omitted, will be bound dynamically.
 * @returns A synchronous storage driver.
 * @throws {Error} Operations propagate per-key storage and JSON failures or an unbound key; binding rejects a different key.
 */
export function localStorageDriver<TSchema extends object>(storageKey?: string): StorageDriver<TSchema> {
  let key = storageKey;

  const getKey = (): string => {
    if (!key) {
      throw new Error(
        "Storage key not initialized in driver. Ensure storageKey is provided in options or store creation.",
      );
    }
    return key;
  };

  const driver: StorageDriver<TSchema> = {
    get(): unknown {
      if (!isStorageAvailable()) {
        return null;
      }
      const raw = localStorage.getItem(getKey());
      return raw === null ? null : JSON.parse(raw);
    },
    set(state: TSchema): boolean {
      if (!isStorageAvailable()) {
        return false;
      }
      localStorage.setItem(getKey(), JSON.stringify(state));
      return true;
    },
    clear(): void {
      if (isStorageAvailable()) {
        localStorage.removeItem(getKey());
      }
    },
    [SET_STORAGE_KEY](k: string) {
      if (key && key !== k) {
        throw new Error(
          `Driver instance cannot be shared across stores with different keys (already bound to "${key}", tried to bind to "${k}").`,
        );
      }
      key = k;
    },
  };

  return driver;
}
