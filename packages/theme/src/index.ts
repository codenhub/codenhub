/**
 * Zero-dependency browser theme preference helper: applies a light, dark, or custom theme, follows the OS color scheme,
 * and remembers the user's choice.
 *
 * @packageDocumentation
 */

export { THEME_CHANGE_EVENT } from "./constants";
export { createTheme } from "./theme";
export type {
  ActiveTheme,
  Theme,
  ThemeDefinition,
  SystemThemeMap,
  ThemeClassResolver,
  ThemeChangeSource,
  ThemeChangeDetail,
  ThemeChangeEvent,
  ThemeChangeListener,
  ThemeOptions,
} from "./types";
