import type { ThemeDefinition, ResolvedThemeOptions } from "./types";

/** Window event name dispatched with `ThemeChangeDetail` after a theme change is applied in browser environments. */
export const THEME_CHANGE_EVENT = "themechange";

/** Default `localStorage` key used to store the user's explicit theme preference. */
export const DEFAULT_STORAGE_KEY = "app-theme-preference";

/** Default HTML attribute set on `document.documentElement` to reflect the active theme. */
export const DEFAULT_ATTRIBUTE = "data-theme";

/** Default CSS class name applied to `document.documentElement` when a dark color scheme theme is active. */
export const DARK_CLASS = "dark";

/** Media query used to detect if the user's OS preference is set to a dark color scheme. */
export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

/** Regular expression used to match and validate whitespace characters in CSS class names. */
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

/** Default resolved options used to initialize theme management when custom options are not provided. */
export const DEFAULT_OPTIONS: ResolvedThemeOptions<Record<string, string>> = {
  themes: [LIGHT_THEME, DARK_THEME],
  defaultTheme: LIGHT_THEME.name,
  systemTheme: { light: LIGHT_THEME.name, dark: DARK_THEME.name },
  storageKey: DEFAULT_STORAGE_KEY,
  attribute: DEFAULT_ATTRIBUTE,
  isTailwindcss: false,
  shouldApplyClass: true,
};
