import { DARK_CLASS, THEME_CHANGE_EVENT } from "./constants";
import type { ResolvedThemeOptions } from "./options";
import type { ActiveTheme, ThemeChangeDetail } from "./types";

/**
 * Applies the active theme's attribute, color scheme, classes, and CSS custom properties to the DOM.
 *
 * @param classes - Classes of every configured theme, removed unless they belong to the active theme.
 * @param nextClass - Class of the active theme, or `null` when class application is disabled.
 * @internal
 */
export const applyTheme = <TName extends string, TSchema extends Record<string, string>>(args: {
  theme: ActiveTheme<TName, TSchema>;
  options: ResolvedThemeOptions<TName, TSchema>;
  classes: readonly string[];
  nextClass: string | null;
}): void => {
  const { theme, options, classes, nextClass } = args;
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  root.setAttribute(options.attribute, theme.name);
  root.style.colorScheme = theme.colorScheme;

  for (const configuredClass of classes) {
    if (configuredClass !== nextClass) {
      root.classList.remove(configuredClass);
    }
  }

  if (nextClass !== null) {
    root.classList.add(nextClass);
  }

  if (options.darkClass) {
    root.classList.toggle(DARK_CLASS, theme.colorScheme === "dark");
  }

  if (options.tokenSchema) {
    for (const [key, cssVarName] of Object.entries(options.tokenSchema)) {
      const tokenValue = Object.hasOwn(theme.tokens, key) ? theme.tokens[key] : undefined;
      if (tokenValue === undefined) {
        root.style.removeProperty(cssVarName);
      } else {
        root.style.setProperty(cssVarName, tokenValue);
      }
    }
  }
};

/**
 * Reads the computed CSS value of every `tokenSchema` token missing from `knownTokens`.
 *
 * @internal
 */
export const readComputedTokens = <TSchema extends Record<string, string>>(
  tokenSchema: TSchema | undefined,
  knownTokens: Readonly<Partial<Record<keyof TSchema, string>>>,
): Partial<Record<keyof TSchema, string>> => {
  // No prototype, so a token named "__proto__" is recorded as an own key.
  const computedTokens: Partial<Record<keyof TSchema, string>> = Object.create(null);

  if (
    !tokenSchema ||
    typeof window === "undefined" ||
    typeof window.getComputedStyle !== "function" ||
    typeof document === "undefined"
  ) {
    return computedTokens;
  }

  const missingKeys = (Object.keys(tokenSchema) as Array<keyof TSchema>).filter(
    (key) => !Object.hasOwn(knownTokens, key) || knownTokens[key] === undefined,
  );
  if (missingKeys.length === 0) {
    return computedTokens;
  }

  try {
    const style = window.getComputedStyle(document.documentElement);
    if (!style) {
      return computedTokens;
    }
    for (const key of missingKeys) {
      const value = style.getPropertyValue(tokenSchema[key]).trim();
      if (value) {
        computedTokens[key] = value;
      }
    }
  } catch (error) {
    // getComputedStyle can fail in sandboxed or restricted environments; report it and fall back to known tokens.
    console.error("[theme] Failed to read computed token styles:", error);
  }

  return computedTokens;
};

/**
 * Dispatches a custom `themechange` event on the window.
 *
 * @internal
 */
export const emitThemeEvent = <TName extends string, TSchema extends Record<string, string>>(
  detail: ThemeChangeDetail<TName, TSchema>,
): void => {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof window.CustomEvent !== "function"
  ) {
    return;
  }

  window.dispatchEvent(new CustomEvent<ThemeChangeDetail<TName, TSchema>>(THEME_CHANGE_EVENT, { detail }));
};

/**
 * Reverts the attribute, classes, color scheme, and CSS custom properties applied to the document element.
 *
 * @internal
 */
export const removeAppliedTheme = <TName extends string, TSchema extends Record<string, string>>(args: {
  options: ResolvedThemeOptions<TName, TSchema>;
  classes: readonly string[];
}): void => {
  const { options, classes } = args;
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  root.removeAttribute(options.attribute);
  root.style.removeProperty("color-scheme");

  for (const configuredClass of classes) {
    root.classList.remove(configuredClass);
  }

  if (options.darkClass) {
    root.classList.remove(DARK_CLASS);
  }

  if (options.tokenSchema) {
    for (const cssVarName of Object.values(options.tokenSchema)) {
      root.style.removeProperty(cssVarName);
    }
  }
};
