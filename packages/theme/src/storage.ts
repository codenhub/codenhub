/**
 * An explicit choice as stored: a theme name, and whether it follows the OS color scheme within its pair.
 *
 * @internal
 */
export interface StoredChoice<TName extends string> {
  name: TName;
  followSystem: boolean;
}

/**
 * Reads, writes, and removes the explicit theme preference in `localStorage`.
 *
 * A fixed choice is stored as the bare theme name. A choice that follows the system is stored as
 * `{"name":"…","followSystem":true}`, which a version that reads only bare names rejects as an unconfigured theme.
 *
 * @internal
 */
export interface PreferenceStorage<TName extends string> {
  /**
   * Returns the stored choice when it names a configured theme; otherwise `null`. A value that is exactly a configured
   * name is read as a bare name, even when it would also parse as the object form.
   */
  read(): StoredChoice<TName> | null;
  write(choice: StoredChoice<TName>): void;
  remove(): void;
  /**
   * Returns whether a `storage` event's area is `localStorage`. A `null` area, which only a hand-built event has,
   * counts as `localStorage`.
   */
  isArea(area: Storage | null): boolean;
}

type StorageOperation = "read from" | "write to" | "remove from";

const parseChoice = <TName extends string>(
  value: string,
  themes: ReadonlyMap<TName, unknown>,
): StoredChoice<TName> | null => {
  if (themes.has(value as TName)) {
    return { name: value as TName, followSystem: false };
  }
  if (!value.startsWith("{")) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const { name, followSystem } = parsed as Record<string, unknown>;
  return typeof name === "string" && themes.has(name as TName)
    ? { name: name as TName, followSystem: followSystem === true }
    : null;
};

const serializeChoice = <TName extends string>(choice: StoredChoice<TName>): string =>
  choice.followSystem ? JSON.stringify({ name: choice.name, followSystem: true }) : choice.name;

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
        const stored = storage.getItem(storageKey);
        return stored === null ? null : parseChoice(stored, themes);
      }),
    write: (choice) =>
      attempt("write to", undefined, (storage) => storage.setItem(storageKey, serializeChoice(choice))),
    remove: () => attempt("remove from", undefined, (storage) => storage.removeItem(storageKey)),
    isArea: (area) => area === null || attempt("read from", false, (storage) => area === storage),
  };
};
