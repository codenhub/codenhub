import { createStore } from "../../modules/store";

const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_CHANGE_EVENT = "themechange";
const THEME_STORAGE_KEY = "app-theme-preference";
const THEME_ATTRIBUTE = "data-theme";
const DARK_THEME_CLASS = "dark";

interface ThemeStoreSchema {
  theme?: Theme;
}

const [LIGHT_THEME, DARK_THEME] = THEMES;
const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

const isThemeStoreSchema = (raw: unknown): raw is ThemeStoreSchema => {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const { theme } = raw as ThemeStoreSchema;
  return theme === undefined || theme === LIGHT_THEME || theme === DARK_THEME;
};

const themeStore = createStore<ThemeStoreSchema>(THEME_STORAGE_KEY, {}, { validate: isThemeStoreSchema });

let isSystemThemeListenerRegistered = false;

const isClientEnvironment = (): boolean => {
  return typeof window !== "undefined" && typeof document !== "undefined";
};

const parseTheme = (value: string | null | undefined): Theme | null => {
  if (value === LIGHT_THEME || value === DARK_THEME) {
    return value;
  }

  return null;
};

const applyTheme = (theme: Theme): void => {
  if (!isClientEnvironment()) {
    return;
  }

  const root = document.documentElement;
  const isDarkTheme = theme === DARK_THEME;

  root.classList.toggle(DARK_THEME_CLASS, isDarkTheme);
  root.setAttribute(THEME_ATTRIBUTE, theme);
  root.style.colorScheme = theme;
};

const dispatchThemeChange = (theme: Theme): void => {
  if (!isClientEnvironment()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<{ theme: Theme }>(THEME_CHANGE_EVENT, {
      detail: { theme },
    }),
  );
};

const handleSystemThemeChange = (event: MediaQueryListEvent): void => {
  if (getStoredTheme() !== null) {
    return;
  }

  const nextTheme: Theme = event.matches ? DARK_THEME : LIGHT_THEME;
  applyTheme(nextTheme);
  dispatchThemeChange(nextTheme);
};

const registerSystemThemeListener = (): void => {
  if (!isClientEnvironment() || isSystemThemeListenerRegistered) {
    return;
  }

  const mediaQueryList = window.matchMedia(PREFERS_DARK_QUERY);
  mediaQueryList.addEventListener("change", handleSystemThemeChange);
  isSystemThemeListenerRegistered = true;
};

export const getSystemTheme = (): Theme => {
  if (!isClientEnvironment()) {
    return LIGHT_THEME;
  }

  return window.matchMedia(PREFERS_DARK_QUERY).matches ? DARK_THEME : LIGHT_THEME;
};

export const getStoredTheme = (): Theme | null => {
  if (!isClientEnvironment()) {
    return null;
  }

  return parseTheme(themeStore.get().theme);
};

export const getTheme = (): Theme => {
  return getStoredTheme() ?? getSystemTheme();
};

export const setTheme = (theme: Theme): void => {
  if (!isClientEnvironment()) {
    return;
  }

  themeStore.set({ theme });
  applyTheme(theme);
  dispatchThemeChange(theme);
};

export const clearThemePreference = (): Theme => {
  if (!isClientEnvironment()) {
    return LIGHT_THEME;
  }

  themeStore.clear();

  const systemTheme = getSystemTheme();
  applyTheme(systemTheme);
  dispatchThemeChange(systemTheme);

  return systemTheme;
};

export const toggleTheme = (): Theme => {
  const nextTheme: Theme = getTheme() === DARK_THEME ? LIGHT_THEME : DARK_THEME;
  setTheme(nextTheme);
  return nextTheme;
};

export const initTheme = (): void => {
  if (!isClientEnvironment()) {
    return;
  }

  registerSystemThemeListener();
  applyTheme(getTheme());
};
