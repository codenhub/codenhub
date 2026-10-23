/**
 * Reads, writes, and removes the explicit theme preference in `localStorage`.
 *
 * @internal
 */
export interface PreferenceStorage<TName extends string> {
  /** Returns the stored name when it matches a configured theme; otherwise `null`. */
  read(): TName | null;
  write(themeName: TName): void;
  remove(): void;
}

type StorageOperation = "read from" | "write to" | "remove from";

/**
 * Creates the preference storage of one manager. A failing operation is logged with `console.error` the first time
 * it fails, so a page with blocked storage logs one error per kind of operation instead of one per call.
 *
 * @internal
 */
export const createPreferenceStorage = <TName extends string>(
  storageKey: string,
  themes: ReadonlyMap<TName, unknown>,
): PreferenceStorage<TName> => {
  const reported = new Set<StorageOperation>();

  const attempt = <T>(operation: StorageOperation, fallback: T, run: (storage: Storage) => T): T => {
    if (typeof window === "undefined") {
      return fallback;
    }
    try {
      return run(window.localStorage);
    } catch (error) {
      if (!reported.has(operation)) {
        reported.add(operation);
        console.error(`[theme] Failed to ${operation} localStorage:`, error);
      }
      return fallback;
    }
  };

  return {
    read: () =>
      attempt("read from", null, (storage) => {
        const storedName = storage.getItem(storageKey);
        return storedName !== null && themes.has(storedName as TName) ? (storedName as TName) : null;
      }),
    write: (themeName) => attempt("write to", undefined, (storage) => storage.setItem(storageKey, themeName)),
    remove: () => attempt("remove from", undefined, (storage) => storage.removeItem(storageKey)),
  };
};
