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
  #listeners = new Set<ThemeChangeListener<TSchema>>();
  #mediaQueryList: MediaQueryList | null = null;
  #hasStorageListener = false;
  #isInitialized = false;

  #handleSystemChange = (event: MediaQueryListEvent): void => {
    if (this.getStored() !== null) {
      return;
    }

    const name = event.matches ? this.#options.systemTheme.dark : this.#options.systemTheme.light;
    if (this.#activeName !== name) {
      this.#activate(name, { source: "system", shouldStore: false });
    }
  };

  #handleStorageChange = (event: StorageEvent): void => {
    if (event.key !== this.#options.storageKey) {
      return;
    }

    if (event.newValue === null) {
      const systemTheme = this.getSystem().name;
      if (this.#activeName !== systemTheme) {
        this.#activate(systemTheme, { source: "clearPreference", shouldStore: false });
      }
    } else {
      const isConfigured = this.#options.themes.some((t) => t.name === event.newValue);
      if (isConfigured && this.#activeName !== event.newValue) {
        this.#activate(event.newValue, { source: "set", shouldStore: false });
      }
    }
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
    if (this.#isInitialized) {
      return this;
    }
    this.#registerSystemListener();
    this.#registerStorageListener();
    if (typeof this.#options.shouldApplyClass === "function") {
      for (const theme of this.#options.themes) {
        getThemeClass(theme, this.#options.shouldApplyClass);
      }
    }
    this.#activate(this.getStored() ?? this.getSystem().name, {
      source: "init",
      shouldStore: false,
      tokens,
    });
    this.#isInitialized = true;
    return this;
  }

  get(): ThemeDefinition<TSchema> {
    const baseTheme = this.#getTheme(this.#activeName);
    const computedTokens: Partial<Record<keyof TSchema, string>> = {};

    if (isBrowser() && this.#options.tokenSchema) {
      const root = document.documentElement;
      try {
        const style = window.getComputedStyle(root);
        if (style !== null) {
          const schema = this.#options.tokenSchema;
          const mergedTokens = {
            ...baseTheme.tokens,
            ...this.#activeTokens,
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
    }

    return {
      ...baseTheme,
      tokens: {
        ...computedTokens,
        ...baseTheme.tokens,
        ...this.#activeTokens,
      },
    };
  }

  set(name: string, tokens?: Partial<Record<keyof TSchema, string>>): ThemeDefinition<TSchema> {
    return this.#activate(name, { source: "set", shouldStore: true, tokens });
  }

  toggle(tokens?: Partial<Record<keyof TSchema, string>>): ThemeDefinition<TSchema> {
    const nextName =
      this.get().name === this.#options.systemTheme.dark
        ? this.#options.systemTheme.light
        : this.#options.systemTheme.dark;
    return this.#activate(nextName, { source: "toggle", shouldStore: true, tokens });
  }

  clearPreference(): ThemeDefinition<TSchema> {
    this.#removeStored();
    return this.#activate(this.getSystem().name, { source: "clearPreference", shouldStore: false });
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

    try {
      const mql = window.matchMedia(PREFERS_DARK_QUERY);
      const name = mql && mql.matches ? this.#options.systemTheme.dark : this.#options.systemTheme.light;
      return this.#getTheme(name);
    } catch {
      return this.#getTheme(this.#options.defaultTheme);
    }
  }

  subscribe(listener: ThemeChangeListener<TSchema>): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.#mediaQueryList !== null) {
      try {
        if (typeof this.#mediaQueryList.removeEventListener === "function") {
          this.#mediaQueryList.removeEventListener("change", this.#handleSystemChange);
        } else if (typeof this.#mediaQueryList.removeListener === "function") {
          this.#mediaQueryList.removeListener(this.#handleSystemChange);
        }
      } catch {
        // Ignore removal errors
      }
      this.#mediaQueryList = null;
    }

    if (this.#hasStorageListener) {
      window.removeEventListener("storage", this.#handleStorageChange);
      this.#hasStorageListener = false;
    }

    this.#listeners.clear();
    this.#isInitialized = false;
  }

  #registerStorageListener(): void {
    if (!isBrowser() || this.#hasStorageListener) {
      return;
    }
    window.addEventListener("storage", this.#handleStorageChange);
    this.#hasStorageListener = true;
  }

  #activate(
    name: string,
    options: {
      source: ThemeChangeSource;
      shouldStore?: boolean;
      tokens?: Partial<Record<keyof TSchema, string>>;
    },
  ): ThemeDefinition<TSchema> {
    assertRuntimeTokens(options.tokens, this.#options.tokenSchema);
    const theme = this.#getTheme(name);
    this.#activeName = theme.name;
    if (options.tokens !== undefined) {
      this.#activeTokens = options.tokens;
    }

    if (options.shouldStore) {
      this.#store(theme.name);
    }

    this.#apply(theme);

    const activeTheme = this.get();
    this.#emit({ name: activeTheme.name, theme: activeTheme, source: options.source });

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

    try {
      const mql = window.matchMedia(PREFERS_DARK_QUERY);
      if (mql) {
        if (typeof mql.addEventListener === "function") {
          mql.addEventListener("change", this.#handleSystemChange);
        } else if (typeof mql.addListener === "function") {
          mql.addListener(this.#handleSystemChange);
        }
        this.#mediaQueryList = mql;
      }
    } catch {
      // Ignore system change errors and fail silently
    }
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
