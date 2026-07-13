import { PREFERS_DARK_QUERY } from "./constants";
import type { ThemeDefinition } from "./types";

/**
 * Resolves the configured theme that matches the active OS color-scheme preference.
 *
 * @internal
 */
export const readSystemTheme = <TSchema extends Record<string, string>>(options: {
  defaultTheme: string;
  systemTheme: { light: string; dark: string };
  themes: readonly ThemeDefinition<TSchema>[];
}): ThemeDefinition<TSchema> => {
  const { defaultTheme, systemTheme, themes } = options;
  const getTheme = (name: string): ThemeDefinition<TSchema> => {
    const theme = themes.find((candidate) => candidate.name === name);
    if (theme === undefined) {
      // Constructor validation (assertThemeConfig) prevents this path via the public API.
      // c8 ignore next
      throw new Error(`Theme is not configured: ${name}.`);
    }
    return theme;
  };

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return getTheme(defaultTheme);
  }

  try {
    const mql = window.matchMedia(PREFERS_DARK_QUERY);
    const name = mql.matches ? systemTheme.dark : systemTheme.light;
    return getTheme(name);
  } catch {
    return getTheme(defaultTheme);
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
