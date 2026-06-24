/** Theme option stored, applied to the configured DOM attribute, and mapped to the browser color scheme. */
export interface ThemeDefinition<TSchema extends Record<string, string> = Record<string, string>> {
  /** Unique configured theme name used for storage, DOM attributes, and generated default classes. */
  name: string;
  /** Browser color scheme applied to `document.documentElement.style.colorScheme`. */
  colorScheme: "light" | "dark";
  /** Optional theme-specific static token values. */
  tokens?: Partial<Record<keyof TSchema, string>>;
}

/** Mapping from OS color-scheme preferences to configured theme names. */
export interface SystemThemeMap {
  /** Configured theme name used when the OS preference is light or no dark preference is detected. */
  light: string;
  /** Configured theme name used when the OS preference is dark. */
  dark: string;
}

/** Resolves the single DOM class token applied for a theme when custom class application is enabled. */
export type ThemeClassResolver<TSchema extends Record<string, string> = Record<string, string>> = (
  theme: ThemeDefinition<TSchema>,
) => string;

/** Reason a theme change notification was emitted. */
export type ThemeChangeSource = "init" | "set" | "toggle" | "clearPreference" | "system";

/** Payload passed to subscribers and the browser `themechange` event after a theme change. */
export interface ThemeChangeDetail<TSchema extends Record<string, string> = Record<string, string>> {
  /** Active theme name after the change. */
  name: string;
  /** Active theme definition after the change. */
  theme: ThemeDefinition<TSchema>;
  /** Operation or browser signal that caused the change notification. */
  source: ThemeChangeSource;
}

/** In-process callback registered with `Theme.subscribe()` for applied theme changes. */
export type ThemeChangeListener<TSchema extends Record<string, string> = Record<string, string>> = (
  detail: ThemeChangeDetail<TSchema>,
) => void;

/** Configuration for theme definitions, persistence, DOM application, and system preference mapping. */
export interface ThemeOptions<TSchema extends Record<string, string> = Record<string, string>> {
  /** Available themes. Names must be unique, non-empty, and valid default class tokens when `shouldApplyClass` is `true`. */
  themes?: readonly ThemeDefinition<TSchema>[];
  /** Configured theme name used before initialization and when browser APIs are unavailable. */
  defaultTheme?: string;
  /** Configured theme names selected for OS light and dark color-scheme preferences. */
  systemTheme?: SystemThemeMap;
  /** `localStorage` key used for explicit user preferences. */
  storageKey?: string;
  /** Attribute set on `document.documentElement` with the active theme name. */
  attribute?: string;
  /** Whether to toggle Tailwind CSS's `dark` class for themes with `colorScheme: "dark"`. */
  isTailwindcss?: boolean;
  /** Whether and how to apply a theme-specific class to `document.documentElement`. */
  shouldApplyClass?: boolean | ThemeClassResolver<TSchema>;
  /** Schema mapping theme token names to their corresponding CSS Custom Property names. */
  tokenSchema?: TSchema;
}

/**
 * Fully resolved configuration options for theme management.
 * Contains defaults for any option not explicitly provided in the initial configuration.
 */
export interface ResolvedThemeOptions<TSchema extends Record<string, string> = Record<string, string>> {
  /** The complete list of available theme definitions. */
  themes: readonly ThemeDefinition<TSchema>[];
  /** The theme name used when no user preference has been saved and the system preference cannot be determined. */
  defaultTheme: string;
  /** Mapping of system color scheme preferences (light/dark) to target theme names. */
  systemTheme: SystemThemeMap;
  /** The localStorage key under which the user's explicit theme preference is persisted. */
  storageKey: string;
  /** The HTML attribute on `document.documentElement` where the active theme name is applied. */
  attribute: string;
  /** Whether Tailwind CSS's dark mode class should be automatically toggled on the document element. */
  isTailwindcss: boolean;
  /** Custom resolver function or boolean determining whether and how theme-specific CSS classes are applied to the document element. */
  shouldApplyClass: boolean | ThemeClassResolver<TSchema>;
  /** Optional schema mapping token names to their corresponding CSS Custom Property names. */
  tokenSchema?: TSchema;
}
