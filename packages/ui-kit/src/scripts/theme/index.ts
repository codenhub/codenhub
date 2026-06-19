import { Theme as ThemeManager } from "@codenhub/theme";

const themeManager = new ThemeManager({ tailwindcss: true });

export const THEME_CHANGE_EVENT = "themechange";

const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const getSystemTheme = (): Theme => {
  return themeManager.getSystem().name as Theme;
};

export const getStoredTheme = (): Theme | null => {
  return themeManager.getStored() as Theme | null;
};

export const getTheme = (): Theme => {
  return themeManager.get().name as Theme;
};

export const setTheme = (theme: Theme): void => {
  themeManager.set(theme);
};

export const clearThemePreference = (): Theme => {
  return themeManager.clearPreference().name as Theme;
};

export const toggleTheme = (): Theme => {
  return themeManager.toggle().name as Theme;
};

export const initTheme = (): void => {
  themeManager.init();
};
