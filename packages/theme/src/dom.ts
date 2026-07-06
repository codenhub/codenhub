import { DARK_CLASS, PREFERS_DARK_QUERY, THEME_CHANGE_EVENT } from "./constants";
import { getThemeClass } from "./helpers";
import type { ThemeDefinition, ResolvedThemeOptions, ThemeChangeDetail } from "./types";

/** Constant flag checking if the runtime environment is a browser. */
export const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

/**
 * Reads and validates the user's stored theme preference from `localStorage`.
 * Returns the theme name if it exists and matches a configured theme; otherwise `null`.
 */
export const readStorage = <TSchema extends Record<string, string>>(
  storageKey: string,
  themes: readonly ThemeDefinition<TSchema>[],
): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    if (typeof window.localStorage === "undefined") {
      return null;
    }
    const storedName = window.localStorage.getItem(storageKey);
    if (storedName === null) {
      return null;
    }
    const isConfigured = themes.some((t) => t.name === storedName);
    return isConfigured ? storedName : null;
  } catch {
    return null;
  }
};

/** Writes the explicit theme preference to `localStorage`. */
export const writeStorage = (storageKey: string, themeName: string): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (typeof window.localStorage === "undefined") {
      return;
    }
    window.localStorage.setItem(storageKey, themeName);
  } catch {
    // Ignore storage write errors
  }
};

/** Removes the explicit theme preference from `localStorage`. */
export const removeStorage = (storageKey: string): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (typeof window.localStorage === "undefined") {
      return;
    }
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage removal errors
  }
};

/** Resolves the configured theme that matches the active OS color-scheme preference. */
export const readSystemTheme = <TSchema extends Record<string, string>>(options: {
  defaultTheme: string;
  systemTheme: { light: string; dark: string };
  themes: readonly ThemeDefinition<TSchema>[];
}): ThemeDefinition<TSchema> => {
  const { defaultTheme, systemTheme, themes } = options;
  const getTheme = (name: string): ThemeDefinition<TSchema> => {
    const theme = themes.find((candidate) => candidate.name === name);
    if (theme === undefined) {
      throw new Error(`Theme is not configured: ${name}.`);
    }
    return theme;
  };

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return getTheme(defaultTheme);
  }

  try {
    const mql = window.matchMedia(PREFERS_DARK_QUERY);
    const name = mql && mql.matches ? systemTheme.dark : systemTheme.light;
    return getTheme(name);
  } catch {
    return getTheme(defaultTheme);
  }
};

/** Registers a media query listener for system color-scheme changes and returns a cleanup function. */
export const registerSystemListener = (handler: (event: MediaQueryListEvent) => void): (() => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  let mql: MediaQueryList | null = null;
  try {
    mql = window.matchMedia(PREFERS_DARK_QUERY);
    if (mql) {
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", handler);
      } else if (typeof mql.addListener === "function") {
        mql.addListener(handler);
      }
    }
  } catch {
    // Ignore system listener registration errors
  }

  return () => {
    if (mql === null) {
      return;
    }
    try {
      if (typeof mql.removeEventListener === "function") {
        mql.removeEventListener("change", handler);
      } else if (typeof mql.removeListener === "function") {
        mql.removeListener(handler);
      }
    } catch {
      // Ignore removal errors
    }
  };
};

/** Registers a listener for local storage changes and returns a cleanup function. */
export const registerStorageListener = (handler: (event: StorageEvent) => void): (() => void) => {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }

  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener("storage", handler);
  };
};

/** Applies the active theme configuration, class/attribute classes, and CSS Custom Properties to the DOM. */
export const applyTheme = <TSchema extends Record<string, string>>(args: {
  theme: ThemeDefinition<TSchema>;
  options: ResolvedThemeOptions<TSchema>;
  activeTokens: Partial<Record<keyof TSchema, string>>;
}): void => {
  const { theme, options, activeTokens } = args;
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const nextClass = getThemeClass(theme, options.shouldApplyClass);
  const configuredClasses = options.themes
    .map((configuredTheme) => getThemeClass(configuredTheme, options.shouldApplyClass))
    .filter((configuredClass): configuredClass is string => configuredClass !== null);

  root.setAttribute(options.attribute, theme.name);
  root.style.colorScheme = theme.colorScheme;

  for (const configuredClass of configuredClasses) {
    root.classList.remove(configuredClass);
  }

  if (nextClass !== null) {
    root.classList.add(nextClass);
  }

  if (options.isTailwindCss) {
    root.classList.toggle(DARK_CLASS, theme.colorScheme === "dark");
  }

  if (options.tokenSchema) {
    const schema = options.tokenSchema;
    const mergedTokens = {
      ...theme.tokens,
      ...activeTokens,
    };

    for (const key of Object.keys(schema) as Array<keyof TSchema>) {
      const cssVarName = schema[key];
      const tokenValue = mergedTokens[key];
      if (tokenValue !== undefined && tokenValue !== null) {
        root.style.setProperty(cssVarName, tokenValue);
      } else {
        root.style.removeProperty(cssVarName);
      }
    }
  }
};

/** Resolves any missing CSS variables from the computed style of the root DOM element. */
export const readComputedTokens = <TSchema extends Record<string, string>>(args: {
  theme: ThemeDefinition<TSchema>;
  options: ResolvedThemeOptions<TSchema>;
  activeTokens: Partial<Record<keyof TSchema, string>>;
}): Partial<Record<keyof TSchema, string>> => {
  const { theme, options, activeTokens } = args;
  const computedTokens: Partial<Record<keyof TSchema, string>> = {};

  if (typeof window === "undefined" || typeof document === "undefined" || !options.tokenSchema) {
    return computedTokens;
  }

  const root = document.documentElement;
  try {
    const style = window.getComputedStyle(root);
    if (style !== null) {
      const schema = options.tokenSchema;
      const mergedTokens = {
        ...theme.tokens,
        ...activeTokens,
      };

      for (const key of Object.keys(schema) as Array<keyof TSchema>) {
        if (mergedTokens[key] === undefined) {
          const val = style.getPropertyValue(schema[key]).trim();
          if (val) {
            computedTokens[key] = val;
          }
        }
      }
    }
  } catch {
    // Fallback silently if computed style access fails
  }

  return computedTokens;
};

/** Dispatches a custom `themechange` event on the window. */
export const emitThemeEvent = <TSchema extends Record<string, string>>(detail: ThemeChangeDetail<TSchema>): void => {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof window.CustomEvent !== "function"
  ) {
    return;
  }

  window.dispatchEvent(new CustomEvent<ThemeChangeDetail<TSchema>>(THEME_CHANGE_EVENT, { detail }));
};
