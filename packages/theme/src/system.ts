import { PREFERS_DARK_QUERY } from "./constants";
import type { SystemThemeMap } from "./types";

/**
 * Returns the theme name mapped to the current OS color-scheme preference, or `defaultTheme` when `matchMedia` is
 * unavailable or throws.
 *
 * @internal
 */
export const readSystemTheme = <TName extends string>(options: {
  defaultTheme: TName;
  systemTheme: SystemThemeMap<TName>;
}): TName => {
  const { defaultTheme, systemTheme } = options;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return defaultTheme;
  }

  try {
    return window.matchMedia(PREFERS_DARK_QUERY).matches ? systemTheme.dark : systemTheme.light;
  } catch {
    return defaultTheme;
  }
};

/**
 * Registers a media query listener for system color-scheme changes and returns a cleanup function.
 *
 * @internal
 */
export const registerSystemListener = (handler: (event: MediaQueryListEvent) => void): (() => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const mql = (() => {
    try {
      return window.matchMedia(PREFERS_DARK_QUERY);
    } catch {
      return null;
    }
  })();

  let useLegacy = false;

  if (mql) {
    try {
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", handler);
      } else if (typeof (mql as unknown as Record<string, unknown>).addListener === "function") {
        useLegacy = true;
        (mql as unknown as { addListener: (cb: typeof handler) => void }).addListener(handler);
      }
    } catch {
      // Ignore system listener registration errors
    }
  }

  return () => {
    if (mql === null) {
      return;
    }
    try {
      if (useLegacy && typeof (mql as unknown as Record<string, unknown>).removeListener === "function") {
        (mql as unknown as { removeListener: (cb: typeof handler) => void }).removeListener(handler);
      } else if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", handler);
      }
    } catch {
      // Ignore removal errors
    }
  };
};

/**
 * Registers a listener for local storage changes across tabs and returns a cleanup function.
 *
 * @internal
 */
export const registerStorageListener = (handler: (event: StorageEvent) => void): (() => void) => {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }

  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener("storage", handler);
  };
};
