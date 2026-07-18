import { createTheme } from "@codenhub/theme";

const themeManager = createTheme({ isTailwindCss: true });

/** Window event name emitted after the shared theme manager applies a theme. */
export const THEME_CHANGE_EVENT = "themechange";

const THEMES = ["light", "dark"] as const;
/** Theme names supported by the UI Kit theme singleton. */
export type Theme = (typeof THEMES)[number];

/** Returns the theme matching the system color scheme, with light as the non-browser fallback. */
export const getSystemTheme = (): Theme => {
  return themeManager.getSystem().name as Theme;
};

/** Returns a valid explicit preference from local storage, or null when absent or unavailable. */
export const getStoredTheme = (): Theme | null => {
  return themeManager.getStored() as Theme | null;
};

/** Returns the active in-memory theme, which is light before initialization. */
export const getTheme = (): Theme => {
  return themeManager.get().name as Theme;
};

/**
 * Applies and persists an explicit light or dark preference and emits `themechange` in browser environments.
 *
 * @throws When JavaScript callers pass a theme outside the supported set.
 */
export const setTheme = (theme: Theme): void => {
  themeManager.set(theme);
};

/** Removes the explicit preference, applies the system theme, emits `themechange`, and returns the applied theme. */
export const clearThemePreference = (): Theme => {
  return themeManager.clearPreference().name as Theme;
};

/** Switches to the opposite color scheme, persists it, emits `themechange`, and returns the applied theme. */
export const toggleTheme = (): Theme => {
  return themeManager.toggle().name as Theme;
};

/**
 * Initializes the module singleton once from storage or system preference and installs system and storage listeners.
 * The UI Kit does not expose a corresponding destroy operation.
 */
export const initTheme = (): void => {
  themeManager.init();
};
