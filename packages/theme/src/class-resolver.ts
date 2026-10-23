import { CLASS_TOKEN_WHITESPACE } from "./constants";
import type { ActiveTheme, ThemeClassResolver } from "./types";

/**
 * Resolves the single DOM class token applied for a theme.
 *
 * @returns The class string, or `null` when class application is disabled.
 * @internal
 */
export const getThemeClass = <TName extends string, TSchema extends Record<string, string>>(
  theme: ActiveTheme<TName, TSchema>,
  className: boolean | ThemeClassResolver<TName, TSchema>,
): string | null => {
  if (className === false) {
    return null;
  }

  if (typeof className === "function") {
    const resolved = className(theme);
    assertClassToken(resolved, `Theme class resolver returned an invalid class for theme: ${theme.name}.`);
    return resolved;
  }

  return getDefaultThemeClass(theme.name);
};

/**
 * Returns the `theme-<name>` class applied when `className` is `true`.
 *
 * @throws {Error} When the name contains whitespace.
 * @internal
 */
export const getDefaultThemeClass = (name: string): string => {
  const resolved = `theme-${name}`;
  assertClassToken(resolved, `Theme name cannot be used as a default theme class: ${name}.`);
  return resolved;
};

/**
 * Asserts that a value is a valid single DOM class token (non-empty string, no whitespace).
 *
 * @internal
 */
export const assertClassToken = (className: unknown, message: string): void => {
  if (typeof className !== "string" || className.length === 0 || CLASS_TOKEN_WHITESPACE.test(className)) {
    throw new Error(message);
  }
};
