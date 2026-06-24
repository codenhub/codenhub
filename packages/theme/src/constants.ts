import type { ThemeDefinition, ResolvedThemeOptions } from "./types";

/** Window event name dispatched with `ThemeChangeDetail` after a theme change is applied in browser environments. */
export const THEME_CHANGE_EVENT = "themechange";

export const DEFAULT_STORAGE_KEY = "app-theme-preference";
export const DEFAULT_ATTRIBUTE = "data-theme";
export const DARK_CLASS = "dark";
export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";
export const CLASS_TOKEN_WHITESPACE = /\s/;

/** Built-in light theme used by default and available for custom theme lists. */
export const LIGHT_THEME: ThemeDefinition = {
  name: "light",
  colorScheme: "light",
};

/** Built-in dark theme used by default and available for custom theme lists. */
export const DARK_THEME: ThemeDefinition = {
  name: "dark",
  colorScheme: "dark",
};

export const DEFAULT_OPTIONS: ResolvedThemeOptions<Record<string, string>> = {
  themes: [LIGHT_THEME, DARK_THEME],
  defaultTheme: LIGHT_THEME.name,
  systemTheme: { light: LIGHT_THEME.name, dark: DARK_THEME.name },
  storageKey: DEFAULT_STORAGE_KEY,
  attribute: DEFAULT_ATTRIBUTE,
  isTailwindcss: false,
  shouldApplyClass: true,
};
