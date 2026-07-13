import { DARK_CLASS, THEME_CHANGE_EVENT } from "./constants";
import type { ThemeDefinition, ResolvedThemeOptions, ThemeChangeDetail } from "./types";

/**
 * Applies the active theme configuration, class/attribute updates, and CSS Custom Properties to the DOM.
 *
 * @param resolvedClasses - Pre-computed class strings for all configured themes. Callers must supply
 *   this value; computing it on each activation is the caller's responsibility (see `ThemeImpl`).
 * @param nextClass - Pre-computed class string for the active theme, or `null` when class application is disabled.
 * @internal
 */
export const applyTheme = <TSchema extends Record<string, string>>(args: {
  theme: ThemeDefinition<TSchema>;
  options: ResolvedThemeOptions<TSchema>;
  activeTokens: Partial<Record<keyof TSchema, string>>;
  resolvedClasses: readonly string[];
  nextClass: string | null;
}): void => {
  const { theme, options, activeTokens, resolvedClasses, nextClass } = args;
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  root.setAttribute(options.attribute, theme.name);
  root.style.colorScheme = theme.colorScheme;

  for (const configuredClass of resolvedClasses) {
    if (configuredClass !== nextClass) {
      root.classList.remove(configuredClass);
    }
  }

  if (nextClass !== null) {
    root.classList.add(nextClass);
  }

  if (options.isTailwindCss) {
    root.classList.toggle(DARK_CLASS, theme.colorScheme === "dark");
  }

  if (options.tokenSchema) {
    const schema = options.tokenSchema;
    const mergedTokens = {
      ...theme.tokens,
      ...activeTokens,
    };

    for (const key of Object.keys(schema) as Array<keyof TSchema>) {
      const cssVarName = schema[key];
      const tokenValue = mergedTokens[key];
      if (tokenValue !== undefined && tokenValue !== null) {
        root.style.setProperty(cssVarName, tokenValue);
      } else {
        root.style.removeProperty(cssVarName);
      }
    }
  }
};

/**
 * Resolves any missing CSS variables from the computed style of the root DOM element.
 *
 * @internal
 */
export const readComputedTokens = <TSchema extends Record<string, string>>(args: {
  theme: ThemeDefinition<TSchema>;
  options: ResolvedThemeOptions<TSchema>;
  activeTokens: Partial<Record<keyof TSchema, string>>;
}): Partial<Record<keyof TSchema, string>> => {
  const { theme, options, activeTokens } = args;
  const computedTokens: Partial<Record<keyof TSchema, string>> = {};

  if (
    typeof window === "undefined" ||
    typeof window.getComputedStyle !== "function" ||
    typeof document === "undefined" ||
    !options.tokenSchema
  ) {
    return computedTokens;
  }

  const root = document.documentElement;
  try {
    const schema = options.tokenSchema;
    const mergedTokens = {
      ...theme.tokens,
      ...activeTokens,
    };

    const hasMissingTokens = (Object.keys(schema) as Array<keyof TSchema>).some(
      (key) => mergedTokens[key] === undefined,
    );

    if (!hasMissingTokens) {
      return computedTokens;
    }

    const style = window.getComputedStyle(root);
    if (!style) {
      return computedTokens;
    }
    for (const key of Object.keys(schema) as Array<keyof TSchema>) {
      if (mergedTokens[key] === undefined) {
        const val = style.getPropertyValue(schema[key]).trim();
        if (val) {
          computedTokens[key] = val;
        }
      }
    }
  } catch (error) {
    // getComputedStyle can fail in sandboxed or restricted environments;
    // log in development so unexpected failures are visible, then fall back gracefully.
    console.error("[theme] Failed to read computed token styles:", error);
  }

  return computedTokens;
};

/**
 * Dispatches a custom `themechange` event on the window.
 *
 * @internal
 */
export const emitThemeEvent = <TSchema extends Record<string, string>>(detail: ThemeChangeDetail<TSchema>): void => {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof window.CustomEvent !== "function"
  ) {
    return;
  }

  window.dispatchEvent(new CustomEvent<ThemeChangeDetail<TSchema>>(THEME_CHANGE_EVENT, { detail }));
};
