import type { ThemeDefinition } from "./types";

/**
 * Reads and validates the user's stored theme preference from `localStorage`.
 * Returns the theme name if it exists and matches a configured theme; otherwise `null`.
 *
 * @internal
 */
export const readStorage = <TSchema extends Record<string, string>>(
  storageKey: string,
  themes: readonly ThemeDefinition<TSchema>[],
): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedName = window.localStorage.getItem(storageKey);
    if (storedName === null) {
      return null;
    }
    const isConfigured = themes.some((t) => t.name === storedName);
    return isConfigured ? storedName : null;
  } catch (error) {
    console.error("[theme] Failed to read from localStorage:", error);
    return null;
  }
};

/**
 * Writes the explicit theme preference to `localStorage`.
 *
 * @internal
 */
export const writeStorage = (storageKey: string, themeName: string): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, themeName);
  } catch (error) {
    console.error("[theme] Failed to write to localStorage:", error);
  }
};

/**
 * Removes the explicit theme preference from `localStorage`.
 *
 * @internal
 */
export const removeStorage = (storageKey: string): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch (error) {
    console.error("[theme] Failed to remove from localStorage:", error);
  }
};
