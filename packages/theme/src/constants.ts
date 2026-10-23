/** Window event name dispatched with `ThemeChangeDetail` after a theme change is applied in browser environments. */
export const THEME_CHANGE_EVENT = "themechange";

/**
 * Default `localStorage` key used to store the user's explicit theme preference.
 *
 * @internal
 */
export const DEFAULT_STORAGE_KEY = "app-theme-preference";

/**
 * Default HTML attribute set on `document.documentElement` to reflect the active theme.
 *
 * @internal
 */
export const DEFAULT_ATTRIBUTE = "data-theme";

/**
 * Class added to `document.documentElement` for dark themes when `darkClass` is enabled.
 *
 * @internal
 */
export const DARK_CLASS = "dark";

/**
 * Media query used to detect if the user's OS preference is set to a dark color scheme.
 *
 * @internal
 */
export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Regular expression used to match and validate whitespace characters in CSS class names.
 *
 * @internal
 */
export const CLASS_TOKEN_WHITESPACE = /\s/;
