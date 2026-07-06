import { CLASS_TOKEN_WHITESPACE } from "./constants";
import type { ThemeDefinition, ThemeClassResolver, ResolvedThemeOptions } from "./types";

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

  const className = `theme-${theme.name}`;
  assertClassToken(className, `Theme name cannot be used as a default theme class: ${theme.name}.`);
  return className;
};

export const assertClassToken = (className: unknown, message: string): void => {
  if (typeof className !== "string" || className.length === 0 || CLASS_TOKEN_WHITESPACE.test(className)) {
    throw new Error(message);
  }
};

export const assertThemeConfig = <TSchema extends Record<string, string>>(
  options: ResolvedThemeOptions<TSchema>,
): void => {
  if (typeof options.attribute !== "string" || options.attribute.trim().length === 0) {
    throw new Error("Theme attribute option must be a non-empty string.");
  }

  if (/[\s"'/>=]/.test(options.attribute)) {
    throw new Error("Theme attribute option must be a valid HTML attribute name.");
  }

  if (typeof options.storageKey !== "string" || options.storageKey.trim().length === 0) {
    throw new Error("Theme storageKey option must be a non-empty string.");
  }

  if (!Array.isArray(options.themes)) {
    throw new Error("Theme options.themes must be an array.");
  }

  const names = new Set<string>();

  if (options.tokenSchema) {
    for (const [key, value] of Object.entries(options.tokenSchema)) {
      if (typeof value !== "string" || !value.startsWith("--")) {
        throw new Error(
          `Token schema key "${key}" must map to a CSS custom property starting with "--". Received: "${value}".`,
        );
      }
    }
  }

  for (const theme of options.themes) {
    if (typeof theme !== "object" || theme === null) {
      throw new Error("Theme definitions must be objects.");
    }

    if (typeof theme.name !== "string" || theme.name.trim().length === 0) {
      throw new Error("Theme names must be non-empty strings.");
    }

    if (theme.colorScheme !== "light" && theme.colorScheme !== "dark") {
      throw new Error(
        `Theme "${theme.name}" has an invalid colorScheme: ${theme.colorScheme}. Must be "light" or "dark".`,
      );
    }

    if (names.has(theme.name)) {
      throw new Error(`Duplicate theme name: ${theme.name}.`);
    }

    names.add(theme.name);

    if (typeof options.shouldApplyClass !== "function") {
      getThemeClass(theme, options.shouldApplyClass);
    }

    if (theme.tokens) {
      if (!options.tokenSchema) {
        throw new Error(`Theme "${theme.name}" defines tokens but no tokenSchema is configured.`);
      }
      for (const tokenKey of Object.keys(theme.tokens)) {
        if (!Object.hasOwn(options.tokenSchema, tokenKey)) {
          throw new Error(`Theme "${theme.name}" defines token "${tokenKey}" which is not present in tokenSchema.`);
        }
      }
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

export const assertRuntimeTokens = <TSchema extends Record<string, string>>(
  tokens: Partial<Record<keyof TSchema, string>> | undefined,
  tokenSchema: TSchema | undefined,
): void => {
  if (tokens === undefined || tokens === null) {
    return;
  }
  if (typeof tokens !== "object" || Array.isArray(tokens)) {
    throw new Error("Runtime tokens must be an object.");
  }
  if (tokenSchema === undefined) {
    throw new Error("Runtime tokens provided but no tokenSchema is configured.");
  }
  for (const tokenKey of Object.keys(tokens)) {
    if (!Object.hasOwn(tokenSchema, tokenKey)) {
      throw new Error(`Runtime token override "${tokenKey}" is not present in tokenSchema.`);
    }
  }
};
