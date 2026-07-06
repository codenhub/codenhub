import { CLASS_TOKEN_WHITESPACE } from "./constants";
import type { ThemeDefinition, ThemeClassResolver } from "./types";

/**
 * Resolves the single DOM class token applied for a theme.
 *
 * @returns The class string, or `null` when class application is disabled.
 * @internal
 */
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
