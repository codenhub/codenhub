import { DEFAULT_ATTRIBUTE, DEFAULT_STORAGE_KEY } from "./constants";
import type { ActiveTheme, SystemThemeMap, ThemeClassResolver, ThemeDefinition, ThemeOptions } from "./types";
import { assertThemeConfig } from "./validation";

/**
 * Options after defaults are applied and validation passed, with themes keyed in a map so no name can collide
 * with an object prototype property.
 *
 * @internal
 */
export interface ResolvedThemeOptions<TName extends string, TSchema extends Record<string, string>> {
  themes: ReadonlyMap<TName, ActiveTheme<TName, TSchema>>;
  defaultTheme: TName;
  systemTheme: SystemThemeMap<TName>;
  storageKey: string;
  attribute: string;
  darkClass: boolean;
  className: boolean | ThemeClassResolver<TName, TSchema>;
  tokenSchema: TSchema | undefined;
}

const DEFAULT_OPTIONS = {
  themes: { light: { colorScheme: "light" }, dark: { colorScheme: "dark" } },
  defaultTheme: "light",
  systemTheme: { light: "light", dark: "dark" },
  storageKey: DEFAULT_STORAGE_KEY,
  attribute: DEFAULT_ATTRIBUTE,
  darkClass: false,
  className: true,
} as const;

/**
 * Applies defaults to `createTheme()` options and validates them.
 *
 * @throws {Error} When the options are invalid; see `assertThemeConfig`.
 * @internal
 */
export const resolveOptions = <TName extends string, TSchema extends Record<string, string>>(
  options: ThemeOptions<TName, TSchema>,
): ResolvedThemeOptions<TName, TSchema> => {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
    systemTheme: { ...DEFAULT_OPTIONS.systemTheme, ...options.systemTheme },
  };
  assertThemeConfig(merged);

  const themes = new Map<TName, ActiveTheme<TName, TSchema>>();
  for (const [name, definition] of Object.entries(merged.themes)) {
    const { colorScheme, tokens, pairedTheme } = definition as ThemeDefinition<TName, TSchema>;
    themes.set(
      name as TName,
      Object.freeze({
        name: name as TName,
        colorScheme,
        tokens: Object.freeze({ ...tokens }) as Partial<Record<keyof TSchema, string>>,
        ...(pairedTheme === undefined ? {} : { pairedTheme }),
      }),
    );
  }

  return {
    themes,
    defaultTheme: merged.defaultTheme as TName,
    systemTheme: merged.systemTheme as SystemThemeMap<TName>,
    storageKey: merged.storageKey,
    attribute: merged.attribute,
    darkClass: merged.darkClass,
    className: merged.className as boolean | ThemeClassResolver<TName, TSchema>,
    tokenSchema: merged.tokenSchema as TSchema | undefined,
  };
};
