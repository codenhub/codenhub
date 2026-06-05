export const THEME_CHANGE_EVENT = "themechange";

const DEFAULT_STORAGE_KEY = "app-theme-preference";
const DEFAULT_ATTRIBUTE = "data-theme";
const DARK_CLASS = "dark";
const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";
const CLASS_TOKEN_WHITESPACE = /\s/;

export interface ThemeDefinition {
  name: string;
  colorScheme: "light" | "dark";
}

export interface SystemThemeMap {
  light: string;
  dark: string;
}

export type ThemeClassResolver = (theme: ThemeDefinition) => string;
export type ThemeChangeSource = "init" | "set" | "toggle" | "clearPreference" | "system";

export interface ThemeChangeDetail {
  name: string;
  theme: ThemeDefinition;
  source: ThemeChangeSource;
}

export type ThemeChangeListener = (detail: ThemeChangeDetail) => void;

export interface ThemeOptions {
  themes?: readonly ThemeDefinition[];
  defaultTheme?: string;
  systemTheme?: SystemThemeMap;
  storageKey?: string;
  attribute?: string;
  tailwindcss?: boolean;
  applyClass?: boolean | ThemeClassResolver;
}

export const lightTheme: ThemeDefinition = {
  name: "light",
  colorScheme: "light",
};

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

  constructor(options: ThemeOptions = {}) {
    this.#options = {
      ...defaultOptions,
      ...options,
      systemTheme: { ...defaultOptions.systemTheme, ...options.systemTheme },
    };
    assertThemeConfig(this.#options);
    this.#activeName = this.#options.defaultTheme;
  }

  init(): this {
    this.#registerSystemListener();
    this.#activate(this.getStored() ?? this.getSystem().name, "init", { shouldStore: false });
    return this;
  }

  get(): ThemeDefinition {
    return this.#getTheme(this.#activeName) ?? this.#getTheme(this.#options.defaultTheme);
  }

  set(name: string): ThemeDefinition {
    return this.#activate(name, "set", { shouldStore: true });
  }

  toggle(): ThemeDefinition {
    const nextName =
      this.get().name === this.#options.systemTheme.dark
        ? this.#options.systemTheme.light
        : this.#options.systemTheme.dark;
    return this.#activate(nextName, "toggle", { shouldStore: true });
  }

  clearPreference(): ThemeDefinition {
    this.#removeStored();
    return this.#activate(this.getSystem().name, "clearPreference", { shouldStore: false });
  }

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

  getSystem(): ThemeDefinition {
    if (!isBrowser() || typeof window.matchMedia !== "function") {
      return this.#getTheme(this.#options.defaultTheme);
    }

    const name = window.matchMedia(PREFERS_DARK_QUERY).matches
      ? this.#options.systemTheme.dark
      : this.#options.systemTheme.light;
    return this.#getTheme(name);
  }

  subscribe(listener: ThemeChangeListener): () => void {
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
