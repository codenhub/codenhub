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
  isTailwindCss?: boolean;
  /** Whether and how to apply a theme-specific class to `document.documentElement`. */
  shouldApplyClass?: boolean | ThemeClassResolver<TSchema>;
  /** Schema mapping theme token names to their corresponding CSS Custom Property names. */
  tokenSchema?: TSchema;
}

/**
 * Fully resolved configuration options for theme management.
 * Contains defaults for any option not explicitly provided in the initial configuration.
 *
 * @internal
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
  isTailwindCss: boolean;
  /** Custom resolver function or boolean determining whether and how theme-specific CSS classes are applied to the document element. */
  shouldApplyClass: boolean | ThemeClassResolver<TSchema>;
  /** Optional schema mapping token names to their corresponding CSS Custom Property names. */
  tokenSchema?: TSchema;
}

/**
 * Core theme preference handler. Manages initialization, switching themes,
 * persistence to localStorage, synchronizing with the OS prefers-color-scheme preference,
 * dynamic token mapping to CSS Custom Properties, and dispatching change events.
 */
export interface Theme<TSchema extends Record<string, string> = Record<string, string>> {
  /**
   * Initializes the theme manager. Resolves the active theme (using the stored preference if valid,
   * falling back to the current OS color-scheme preference), applies classes/attributes to the DOM,
   * and registers the media query listener for automatic system preference updates.
   *
   * @param tokens - Optional runtime override token values to merge and apply.
   * @returns The current `Theme` manager instance for method chaining.
   * @sideEffect Registers a media query event listener on `window` and updates root DOM element attributes/styles. Dispatches a "themechange" event.
   */
  init(tokens?: Partial<Record<keyof TSchema, string>>): this;

  /**
   * Retrieves the active theme configuration including static and computed tokens.
   *
   * Token values are merged in this priority order (last wins):
   * 1. CSS computed style — values read from `window.getComputedStyle` for tokens not defined in JS.
   * 2. Theme static tokens — values defined in `ThemeDefinition.tokens` for the active theme.
   * 3. Runtime overrides — values passed to `init()`, `set()`, `toggle()`, or other methods.
   *
   * @returns The active `ThemeDefinition` object. If `tokenSchema` is configured and a token is not
   * explicitly defined in JS, its value is dynamically resolved from the computed style of the root DOM element in browser environments.
   * @warning Reading computed styles from the DOM via `window.getComputedStyle` can trigger a synchronous layout reflow. Avoid calling `get()` frequently or inside high-performance loops.
   */
  get(): ThemeDefinition<TSchema>;

  /**
   * Activates a configured theme by name and updates the stored preference in `localStorage`.
   *
   * @param name - The name of the configured theme to activate.
   * @param tokens - Optional runtime override token values to apply. Active overrides persist across subsequent theme changes unless cleared (by passing new overrides or an empty object).
   * @returns The activated `ThemeDefinition` with merged and resolved tokens.
   * @throws {Error} If the specified theme name is not found in the configured themes list.
   * @sideEffect Updates root DOM attributes, colorscheme styles, classes, and saves preference to `localStorage`. Dispatches a "themechange" event.
   */
  set(name: string, tokens?: Partial<Record<keyof TSchema, string>>): ThemeDefinition<TSchema>;

  /**
   * Switches the theme between the configured system light and dark themes and persists the change.
   * The next theme is always selected from `systemTheme.light` or `systemTheme.dark` based on the
   * active theme's `colorScheme`, not by cycling the active theme name. In multi-theme setups where
   * the active theme is not one of the system themes, `toggle()` still targets `systemTheme.light`
   * or `systemTheme.dark`.
   *
   * @param tokens - Optional runtime override token values to apply. Active overrides persist across subsequent theme changes unless cleared (by passing new overrides or an empty object).
   * @returns The activated `ThemeDefinition` with merged and resolved tokens.
   * @sideEffect Updates root DOM attributes, colorscheme styles, classes, and saves preference to `localStorage`. Dispatches a "themechange" event.
   */
  toggle(tokens?: Partial<Record<keyof TSchema, string>>): ThemeDefinition<TSchema>;

  /**
   * Removes the explicit user theme preference from storage and resets the theme to match the OS system preference.
   *
   * @returns The activated system `ThemeDefinition` with merged and resolved tokens.
   * @sideEffect Deletes the storage key from `localStorage`, updates root DOM attributes, styles, classes. Dispatches a "themechange" event.
   */
  clearPreference(): ThemeDefinition<TSchema>;

  /**
   * Retrieves the currently stored theme preference name from `localStorage`.
   *
   * @returns The stored theme name if valid and currently configured; otherwise `null` (e.g. during SSR, if storage is empty/unavailable, or if the stored theme name is not configured).
   */
  getStored(): string | null;

  /**
   * Resolves the configured theme that matches the active OS color-scheme preference.
   *
   * @returns The matching `ThemeDefinition`. Falls back to the default theme during SSR or if `matchMedia` is unavailable.
   */
  getSystem(): ThemeDefinition<TSchema>;

  /**
   * Registers a callback listener to receive notifications when the theme or its tokens change.
   *
   * @param listener - Callback function invoked on theme changes.
   * @returns An unsubscribe function to remove the registered listener.
   * @sideEffect Adds the listener to the internal callbacks registry.
   */
  subscribe(listener: ThemeChangeListener<TSchema>): () => void;

  /**
   * Cleans up the theme instance by removing all in-process change listeners and the system
   * preference media query listener. Resets active tokens and the active theme name to the
   * configured `defaultTheme` so the instance can be safely re-initialized with `init()`.
   *
   * @sideEffect Removes event listeners from `window` and clears internal subscriber sets.
   */
  destroy(): void;
}
