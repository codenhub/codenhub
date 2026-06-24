import { CLASS_TOKEN_WHITESPACE } from "./constants";
import type { ThemeDefinition, ThemeClassResolver, ResolvedThemeOptions } from "./types";

export const isBrowser = (): boolean => {
  return typeof window !== "undefined" && typeof document !== "undefined";
};

export const getThemeClass = <TSchema extends Record<string, string>>(
  theme: ThemeDefinition<TSchema>,
  shouldApplyClass: boolean | ThemeClassResolver<TSchema>,
): string | null => {
  if (shouldApplyClass === false) {
    return null;
  }

  if (typeof shouldApplyClass === "function") {
    const className = shouldApplyClass(theme);
    assertClassToken(className, `Theme class resolver returned an invalid class for theme: ${theme.name}.`);
    return className;
  }

  return `theme-${theme.name}`;
};

export const assertClassToken = (className: string, message: string): void => {
  if (className.length === 0 || CLASS_TOKEN_WHITESPACE.test(className)) {
    throw new Error(message);
  }
};

export const assertThemeConfig = <TSchema extends Record<string, string>>(
  options: ResolvedThemeOptions<TSchema>,
): void => {
  const names = new Set<string>();

  for (const theme of options.themes) {
    if (theme.name.trim().length === 0) {
      throw new Error("Theme names must be non-empty.");
    }

    if (names.has(theme.name)) {
      throw new Error(`Duplicate theme name: ${theme.name}.`);
    }

    names.add(theme.name);

    if (options.shouldApplyClass === true) {
      assertClassToken(`theme-${theme.name}`, `Theme name cannot be used as a default theme class: ${theme.name}.`);
    }

    if (theme.tokens && !options.tokenSchema) {
      throw new Error(`Theme "${theme.name}" defines tokens but no tokenSchema is configured.`);
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
