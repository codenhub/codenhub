import { THEME_CHANGE_EVENT, PREFERS_DARK_QUERY, DARK_CLASS, DEFAULT_OPTIONS } from "./constants";
import { isBrowser, getThemeClass, assertThemeConfig, assertRuntimeTokens } from "./helpers";
import type {
  ThemeDefinition,
  ThemeChangeSource,
  ThemeChangeDetail,
  ThemeChangeListener,
  ThemeOptions,
  ResolvedThemeOptions,
} from "./types";

/**
 * Core theme preference manager. Handles initialization, switching themes,
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
   * @returns The active `ThemeDefinition` object. If `tokenSchema` is configured and a token is not
   * explicitly defined in JS, its value is dynamically resolved from the computed style of the root DOM element in browser environments.
   */
  get(): ThemeDefinition<TSchema>;

  /**
   * Activates a configured theme by name and updates the stored preference in `localStorage`.
   *
   * @param name - The name of the configured theme to activate.
   * @param tokens - Optional runtime override token values to apply.
   * @returns The activated `ThemeDefinition` with merged and resolved tokens.
   * @throws {Error} If the specified theme name is not found in the configured themes list.
   * @sideEffect Updates root DOM attributes, colorscheme styles, classes, and saves preference to `localStorage`. Dispatches a "themechange" event.
   */
  set(name: string, tokens?: Partial<Record<keyof TSchema, string>>): ThemeDefinition<TSchema>;

  /**
   * Switches the theme between the configured system light and dark themes and persists the change.
   *
   * @param tokens - Optional runtime override token values to apply.
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
   * Cleans up the theme manager instance by removing all in-process change listeners and the system preference media query listener.
   *
   * @sideEffect Removes event listeners from `window` and clears internal subscriber sets.
   */
  destroy(): void;
}

class ThemeImpl<TSchema extends Record<string, string> = Record<string, string>> implements Theme<TSchema> {
  #options: ResolvedThemeOptions<TSchema>;
  #activeName: string;
  #activeTokens: Partial<Record<keyof TSchema, string>> = {};
  #computedTokens: Partial<Record<keyof TSchema, string>> = {};
  #listeners = new Set<ThemeChangeListener<TSchema>>();
  #mediaQueryList: MediaQueryList | null = null;
  #handleSystemChange = (event: MediaQueryListEvent): void => {
    if (this.getStored() !== null) {
      return;
    }

    const name = event.matches ? this.#options.systemTheme.dark : this.#options.systemTheme.light;
    this.#activate(name, "system", { shouldStore: false });
  };

  constructor(options: ThemeOptions<TSchema> = {}) {
    this.#options = {
      ...DEFAULT_OPTIONS,
      ...options,
      systemTheme: { ...DEFAULT_OPTIONS.systemTheme, ...options.systemTheme },
    } as ResolvedThemeOptions<TSchema>;
    assertThemeConfig(this.#options);
    this.#activeName = this.#options.defaultTheme;
  }

  init(tokens?: Partial<Record<keyof TSchema, string>>): this {
    this.#registerSystemListener();
    this.#activate(this.getStored() ?? this.getSystem().name, "init", { shouldStore: false, tokens });
    return this;
  }

  get(): ThemeDefinition<TSchema> {
    const baseTheme = this.#getTheme(this.#activeName);
    return {
      ...baseTheme,
      tokens: {
        ...this.#computedTokens,
        ...baseTheme.tokens,
        ...this.#activeTokens,
      },
    };
  }

  set(name: string, tokens?: Partial<Record<keyof TSchema, string>>): ThemeDefinition<TSchema> {
    return this.#activate(name, "set", { shouldStore: true, tokens });
  }

  toggle(tokens?: Partial<Record<keyof TSchema, string>>): ThemeDefinition<TSchema> {
    const nextName =
      this.get().name === this.#options.systemTheme.dark
        ? this.#options.systemTheme.light
        : this.#options.systemTheme.dark;
    return this.#activate(nextName, "toggle", { shouldStore: true, tokens });
  }

  clearPreference(): ThemeDefinition<TSchema> {
    this.#removeStored();
    return this.#activate(this.getSystem().name, "clearPreference", { shouldStore: false });
  }

  getStored(): string | null {
    if (!isBrowser()) {
      return null;
    }

    try {
      const storedName = window.localStorage.getItem(this.#options.storageKey);
      if (storedName === null) {
        return null;
      }
      const isConfigured = this.#options.themes.some((t) => t.name === storedName);
      return isConfigured ? storedName : null;
    } catch {
      return null;
    }
  }

  getSystem(): ThemeDefinition<TSchema> {
    if (!isBrowser() || typeof window.matchMedia !== "function") {
      return this.#getTheme(this.#options.defaultTheme);
    }

    const name = window.matchMedia(PREFERS_DARK_QUERY).matches
      ? this.#options.systemTheme.dark
      : this.#options.systemTheme.light;
    return this.#getTheme(name);
  }

  subscribe(listener: ThemeChangeListener<TSchema>): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.#mediaQueryList !== null) {
      this.#mediaQueryList.removeEventListener("change", this.#handleSystemChange);
      this.#mediaQueryList = null;
    }

    this.#listeners.clear();
  }

  #activate(
    name: string,
    source: ThemeChangeSource,
    options: { shouldStore: boolean; tokens?: Partial<Record<keyof TSchema, string>> } = { shouldStore: false },
  ): ThemeDefinition<TSchema> {
    assertRuntimeTokens(options.tokens, this.#options.tokenSchema);
    const theme = this.#getTheme(name);
    this.#activeName = theme.name;
    this.#activeTokens = options.tokens ?? {};

    if (options.shouldStore) {
      this.#store(theme.name);
    }

    this.#apply(theme);

    const activeTheme = this.get();
    this.#emit({ name: activeTheme.name, theme: activeTheme, source });

    return activeTheme;
  }

  #apply(theme: ThemeDefinition<TSchema>): void {
    if (!isBrowser()) {
      return;
    }

    const root = document.documentElement;
    const nextClass = getThemeClass(theme, this.#options.shouldApplyClass);
    const configuredClasses = this.#options.themes
      .map((configuredTheme) => getThemeClass(configuredTheme, this.#options.shouldApplyClass))
      .filter((configuredClass): configuredClass is string => configuredClass !== null);

    root.setAttribute(this.#options.attribute, theme.name);
    root.style.colorScheme = theme.colorScheme;

    for (const configuredClass of configuredClasses) {
      root.classList.remove(configuredClass);
    }

    if (nextClass !== null) {
      root.classList.add(nextClass);
    }

    if (this.#options.isTailwindcss) {
      root.classList.toggle(DARK_CLASS, theme.colorScheme === "dark");
    }

    this.#computedTokens = {};
    if (this.#options.tokenSchema) {
      const schema = this.#options.tokenSchema;
      const mergedTokens = {
        ...theme.tokens,
        ...this.#activeTokens,
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

      const style = window.getComputedStyle(root);
      if (style !== null) {
        for (const key of Object.keys(schema) as Array<keyof TSchema>) {
          if (mergedTokens[key] === undefined) {
            const val = style.getPropertyValue(schema[key]).trim();
            if (val) {
              this.#computedTokens[key] = val;
            }
          }
        }
      }
    }
  }

  #emit(detail: ThemeChangeDetail<TSchema>): void {
    for (const listener of this.#listeners) {
      try {
        listener(detail);
      } catch (error) {
        console.error("Error in theme change listener:", error);
      }
    }

    if (!isBrowser()) {
      return;
    }

    window.dispatchEvent(new CustomEvent<ThemeChangeDetail<TSchema>>(THEME_CHANGE_EVENT, { detail }));
  }

  #getTheme(name: string): ThemeDefinition<TSchema> {
    const theme = this.#options.themes.find((candidate) => candidate.name === name);

    if (theme === undefined) {
      throw new Error(`Theme is not configured: ${name}.`);
    }

    return theme;
  }

  #registerSystemListener(): void {
    if (!isBrowser() || typeof window.matchMedia !== "function" || this.#mediaQueryList !== null) {
      return;
    }

    this.#mediaQueryList = window.matchMedia(PREFERS_DARK_QUERY);
    this.#mediaQueryList.addEventListener("change", this.#handleSystemChange);
  }

  #store(name: string): void {
    if (!isBrowser()) {
      return;
    }

    try {
      window.localStorage.setItem(this.#options.storageKey, name);
    } catch {
      return;
    }
  }

  #removeStored(): void {
    if (!isBrowser()) {
      return;
    }

    try {
      window.localStorage.removeItem(this.#options.storageKey);
    } catch {
      return;
    }
  }
}

/**
 * Factory function that creates and returns a `Theme` manager instance.
 *
 * @param options - Configuration options for theme definitions, persistence keys, DOM attributes, custom class resolvers, and dynamic token schemas.
 * @returns A theme manager instance conforming to the `Theme` interface.
 * @throws {Error} If configured theme names are empty, duplicated, invalid for CSS class application, or if the default/system themes are not present in the configured list.
 */
export function createTheme<TSchema extends Record<string, string> = Record<string, string>>(
  options: ThemeOptions<TSchema> = {},
): Theme<TSchema> {
  return new ThemeImpl<TSchema>(options);
}
