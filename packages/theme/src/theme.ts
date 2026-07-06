import { DEFAULT_OPTIONS } from "./constants";
import {
  readStorage,
  writeStorage,
  removeStorage,
  readSystemTheme,
  registerSystemListener,
  registerStorageListener,
  applyTheme,
  readComputedTokens,
  emitThemeEvent,
} from "./dom";
import { assertThemeConfig, assertRuntimeTokens } from "./helpers";
import type {
  Theme,
  ThemeDefinition,
  ThemeChangeSource,
  ThemeChangeDetail,
  ThemeChangeListener,
  ThemeOptions,
  ResolvedThemeOptions,
} from "./types";

class ThemeImpl<TSchema extends Record<string, string> = Record<string, string>> implements Theme<TSchema> {
  #options: ResolvedThemeOptions<TSchema>;
  #activeName: string;
  #activeTokens: Partial<Record<keyof TSchema, string>> = {};
  #listeners = new Set<ThemeChangeListener<TSchema>>();
  #systemListenerCleanup: (() => void) | null = null;
  #storageListenerCleanup: (() => void) | null = null;
  #isInitialized = false;

  #handleSystemChange = (event: MediaQueryListEvent): void => {
    if (readStorage(this.#options.storageKey, this.#options.themes) !== null) {
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
      this.#activate(systemTheme, { source: "clearPreference", shouldStore: false });
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
    this.#systemListenerCleanup = registerSystemListener(this.#handleSystemChange);
    this.#storageListenerCleanup = registerStorageListener(this.#handleStorageChange);
    this.#activate(readStorage(this.#options.storageKey, this.#options.themes) ?? this.getSystem().name, {
      source: "init",
      shouldStore: false,
      tokens,
    });
    this.#isInitialized = true;
    return this;
  }

  get(): ThemeDefinition<TSchema> {
    const baseTheme = this.#getTheme(this.#activeName);
    const computedTokens = readComputedTokens({
      theme: baseTheme,
      options: this.#options,
      activeTokens: this.#activeTokens,
    });

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
    removeStorage(this.#options.storageKey);
    return this.#activate(this.getSystem().name, { source: "clearPreference", shouldStore: false });
  }

  getStored(): string | null {
    return readStorage(this.#options.storageKey, this.#options.themes);
  }

  getSystem(): ThemeDefinition<TSchema> {
    return readSystemTheme({
      defaultTheme: this.#options.defaultTheme,
      systemTheme: this.#options.systemTheme,
      themes: this.#options.themes,
    });
  }

  subscribe(listener: ThemeChangeListener<TSchema>): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.#systemListenerCleanup) {
      this.#systemListenerCleanup();
      this.#systemListenerCleanup = null;
    }

    if (this.#storageListenerCleanup) {
      this.#storageListenerCleanup();
      this.#storageListenerCleanup = null;
    }

    this.#listeners.clear();
    this.#activeTokens = {};
    this.#isInitialized = false;
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
      writeStorage(this.#options.storageKey, theme.name);
    }

    applyTheme({
      theme,
      options: this.#options,
      activeTokens: this.#activeTokens,
    });

    const activeTheme = this.get();
    this.#emit({ name: activeTheme.name, theme: activeTheme, source: options.source });

    return activeTheme;
  }

  #emit(detail: ThemeChangeDetail<TSchema>): void {
    for (const listener of this.#listeners) {
      try {
        listener(detail);
      } catch (error) {
        console.error("Error in theme change listener:", error);
      }
    }

    emitThemeEvent(detail);
  }

  #getTheme(name: string): ThemeDefinition<TSchema> {
    const theme = this.#options.themes.find((candidate) => candidate.name === name);

    if (theme === undefined) {
      throw new Error(`Theme is not configured: ${name}.`);
    }

    return theme;
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
