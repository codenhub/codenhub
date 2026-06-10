/** Window event name dispatched with `ThemeChangeDetail` after a theme change is applied in browser environments. */
export const THEME_CHANGE_EVENT = "themechange";

const DEFAULT_STORAGE_KEY = "app-theme-preference";
const DEFAULT_ATTRIBUTE = "data-theme";
const DARK_CLASS = "dark";
const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";
const CLASS_TOKEN_WHITESPACE = /\s/;

/** Theme option stored, applied to the configured DOM attribute, and mapped to the browser color scheme. */
export interface ThemeDefinition {
  /** Unique configured theme name used for storage, DOM attributes, and generated default classes. */
  name: string;
  /** Browser color scheme applied to `document.documentElement.style.colorScheme`. */
  colorScheme: "light" | "dark";
}

/** Mapping from OS color-scheme preferences to configured theme names. */
export interface SystemThemeMap {
  /** Configured theme name used when the OS preference is light or no dark preference is detected. */
  light: string;
  /** Configured theme name used when the OS preference is dark. */
  dark: string;
}

/** Resolves the single DOM class token applied for a theme when custom class application is enabled. */
export type ThemeClassResolver = (theme: ThemeDefinition) => string;

/** Reason a theme change notification was emitted. */
export type ThemeChangeSource = "init" | "set" | "toggle" | "clearPreference" | "system";

/** Payload passed to subscribers and the browser `themechange` event after a theme change. */
export interface ThemeChangeDetail {
  /** Active theme name after the change. */
  name: string;
  /** Active theme definition after the change. */
  theme: ThemeDefinition;
  /** Operation or browser signal that caused the change notification. */
  source: ThemeChangeSource;
}

/** In-process callback registered with `Theme.subscribe()` for applied theme changes. */
export type ThemeChangeListener = (detail: ThemeChangeDetail) => void;

/** Configuration for theme definitions, persistence, DOM application, and system preference mapping. */
export interface ThemeOptions {
  /** Available themes. Names must be unique, non-empty, and valid default class tokens when `applyClass` is `true`. */
  themes?: readonly ThemeDefinition[];
  /** Configured theme name used before initialization and when browser APIs are unavailable. */
  defaultTheme?: string;
  /** Configured theme names selected for OS light and dark color-scheme preferences. */
  systemTheme?: SystemThemeMap;
  /** `localStorage` key used for explicit user preferences. */
  storageKey?: string;
  /** Attribute set on `document.documentElement` with the active theme name. */
  attribute?: string;
  /** Whether to toggle Tailwind CSS's `dark` class for themes with `colorScheme: "dark"`. */
  tailwindcss?: boolean;
  /** Whether and how to apply a theme-specific class to `document.documentElement`. */
  applyClass?: boolean | ThemeClassResolver;
}

/** Built-in light theme used by default and available for custom theme lists. */
export const lightTheme: ThemeDefinition = {
  name: "light",
  colorScheme: "light",
};

/** Built-in dark theme used by default and available for custom theme lists. */
export const darkTheme: ThemeDefinition = {
  name: "dark",
  colorScheme: "dark",
};

interface ResolvedThemeOptions {
  themes: readonly ThemeDefinition[];
  defaultTheme: string;
  systemTheme: SystemThemeMap;
  storageKey: string;
  attribute: string;
  tailwindcss: boolean;
  applyClass: boolean | ThemeClassResolver;
}

const defaultOptions: ResolvedThemeOptions = {
  themes: [lightTheme, darkTheme],
  defaultTheme: lightTheme.name,
  systemTheme: { light: lightTheme.name, dark: darkTheme.name },
  storageKey: DEFAULT_STORAGE_KEY,
  attribute: DEFAULT_ATTRIBUTE,
  tailwindcss: false,
  applyClass: true,
};

const isBrowser = (): boolean => {
  return typeof window !== "undefined" && typeof document !== "undefined";
};

const getThemeClass = (theme: ThemeDefinition, applyClass: boolean | ThemeClassResolver): string | null => {
  if (applyClass === false) {
    return null;
  }

  if (typeof applyClass === "function") {
    const className = applyClass(theme);
    assertClassToken(className, `Theme class resolver returned an invalid class for theme: ${theme.name}.`);
    return className;
  }

  return `theme-${theme.name}`;
};

const assertClassToken = (className: string, message: string): void => {
  if (className.length === 0 || CLASS_TOKEN_WHITESPACE.test(className)) {
    throw new Error(message);
  }
};

const assertThemeConfig = (options: ResolvedThemeOptions): void => {
  const names = new Set<string>();

  for (const theme of options.themes) {
    if (theme.name.trim().length === 0) {
      throw new Error("Theme names must be non-empty.");
    }

    if (names.has(theme.name)) {
      throw new Error(`Duplicate theme name: ${theme.name}.`);
    }

    names.add(theme.name);

    if (options.applyClass === true) {
      assertClassToken(`theme-${theme.name}`, `Theme name cannot be used as a default theme class: ${theme.name}.`);
    }
  }

  if (!names.has(options.defaultTheme)) {
    throw new Error(`Default theme is not configured: ${options.defaultTheme}.`);
  }

  if (!names.has(options.systemTheme.light)) {
    throw new Error(`System light theme is not configured: ${options.systemTheme.light}.`);
  }

  if (!names.has(options.systemTheme.dark)) {
    throw new Error(`System dark theme is not configured: ${options.systemTheme.dark}.`);
  }
};

/**
 * Manages theme preference, DOM application, system preference changes, and change notifications.
 *
 * The constructor validates configured theme names, default and system mappings, and default class tokens.
 * Theme application throws `Error` when a requested theme is missing or a class resolver returns an invalid class token.
 */
export class Theme {
  #options: ResolvedThemeOptions;
  #activeName: string;
  #listeners = new Set<ThemeChangeListener>();
  #mediaQueryList: MediaQueryList | null = null;
  #handleSystemChange = (event: MediaQueryListEvent): void => {
    if (this.getStored() !== null) {
      return;
    }

    const name = event.matches ? this.#options.systemTheme.dark : this.#options.systemTheme.light;
    this.#activate(name, "system", { shouldStore: false });
  };

  /** Creates a theme manager with default light/dark themes unless overridden. */
  constructor(options: ThemeOptions = {}) {
    this.#options = {
      ...defaultOptions,
      ...options,
      systemTheme: { ...defaultOptions.systemTheme, ...options.systemTheme },
    };
    assertThemeConfig(this.#options);
    this.#activeName = this.#options.defaultTheme;
  }

  /** Registers system preference handling, applies the initial theme, emits an `init` change, and returns this instance. */
  init(): this {
    this.#registerSystemListener();
    this.#activate(this.getStored() ?? this.getSystem().name, "init", { shouldStore: false });
    return this;
  }

  /** Returns the currently active theme definition. */
  get(): ThemeDefinition {
    return this.#getTheme(this.#activeName) ?? this.#getTheme(this.#options.defaultTheme);
  }

  /** Applies a configured theme by name, stores it when possible, emits a `set` change, and throws `Error` for unknown names. */
  set(name: string): ThemeDefinition {
    return this.#activate(name, "set", { shouldStore: true });
  }

  /** Toggles between the configured system light and dark themes, stores the preference when possible, and emits a `toggle` change. */
  toggle(): ThemeDefinition {
    const nextName =
      this.get().name === this.#options.systemTheme.dark
        ? this.#options.systemTheme.light
        : this.#options.systemTheme.dark;
    return this.#activate(nextName, "toggle", { shouldStore: true });
  }

  /** Removes the stored preference when possible, applies the current system theme, and emits a `clearPreference` change. */
  clearPreference(): ThemeDefinition {
    this.#removeStored();
    return this.#activate(this.getSystem().name, "clearPreference", { shouldStore: false });
  }

  /** Returns the stored configured theme name, or `null` during SSR, storage failures, or invalid stored preferences. */
  getStored(): string | null {
    if (!isBrowser()) {
      return null;
    }

    try {
      const storedName = window.localStorage.getItem(this.#options.storageKey);
      return storedName !== null && this.#getTheme(storedName) !== null ? storedName : null;
    } catch {
      return null;
    }
  }

  /** Returns the configured theme for the current OS color-scheme preference, or the default theme without browser support. */
  getSystem(): ThemeDefinition {
    if (!isBrowser() || typeof window.matchMedia !== "function") {
      return this.#getTheme(this.#options.defaultTheme);
    }

    const name = window.matchMedia(PREFERS_DARK_QUERY).matches
      ? this.#options.systemTheme.dark
      : this.#options.systemTheme.light;
    return this.#getTheme(name);
  }

  /** Registers a listener for in-process theme changes and returns an unsubscribe function. */
  subscribe(listener: ThemeChangeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Removes the system preference listener and clears in-process subscribers. */
  destroy(): void {
    if (this.#mediaQueryList !== null) {
      this.#mediaQueryList.removeEventListener("change", this.#handleSystemChange);
      this.#mediaQueryList = null;
    }

    this.#listeners.clear();
  }

  #activate(name: string, source: ThemeChangeSource, options: { shouldStore: boolean }): ThemeDefinition {
    const theme = this.#getTheme(name);
    this.#activeName = theme.name;

    if (options.shouldStore) {
      this.#store(theme.name);
    }

    this.#apply(theme);
    this.#emit({ name: theme.name, theme, source });

    return theme;
  }

  #apply(theme: ThemeDefinition): void {
    if (!isBrowser()) {
      return;
    }

    const root = document.documentElement;
    const nextClass = getThemeClass(theme, this.#options.applyClass);
    const configuredClasses = this.#options.themes
      .map((configuredTheme) => getThemeClass(configuredTheme, this.#options.applyClass))
      .filter((configuredClass): configuredClass is string => configuredClass !== null);

    root.setAttribute(this.#options.attribute, theme.name);
    root.style.colorScheme = theme.colorScheme;

    for (const configuredClass of configuredClasses) {
      root.classList.remove(configuredClass);
    }

    if (nextClass !== null) {
      root.classList.add(nextClass);
    }

    if (this.#options.tailwindcss) {
      root.classList.toggle(DARK_CLASS, theme.colorScheme === "dark");
    }
  }

  #emit(detail: ThemeChangeDetail): void {
    for (const listener of this.#listeners) {
      listener(detail);
    }

    if (!isBrowser()) {
      return;
    }

    window.dispatchEvent(new CustomEvent<ThemeChangeDetail>(THEME_CHANGE_EVENT, { detail }));
  }

  #getTheme(name: string): ThemeDefinition {
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
