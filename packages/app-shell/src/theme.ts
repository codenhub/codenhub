/** Resolved light/dark theme value stored and applied across the shell. */
export type ShellTheme = "dark" | "light";

/**
 * The shared `localStorage` key every CodenHub surface persists its theme
 * choice under. Each surface's origin has its own storage, so the shared name
 * is a convention for consistency, not cross-origin persistence.
 */
export const THEME_STORAGE_KEY = "codenhub-theme";

/**
 * Resolves the theme to apply on load: the stored choice if it is a valid
 * theme value, otherwise the system preference. Takes no storage or media
 * query access itself — a caller reads `localStorage` and
 * `matchMedia("(prefers-color-scheme: dark)")` and passes the results in, so
 * this stays usable before either API is available (e.g. during SSR) and in
 * any host, DOM-shape-agnostic.
 * @param stored The value read from {@link THEME_STORAGE_KEY}, or `null` if unset or unavailable.
 * @param prefersDark Whether the system prefers a dark color scheme.
 * @returns The theme to apply.
 */
export function resolveInitialTheme(stored: string | null, prefersDark: boolean): ShellTheme {
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return prefersDark ? "dark" : "light";
}

/**
 * The theme a toggle switches to from the current one.
 * @param current The theme currently applied.
 * @returns The other theme.
 */
export function nextTheme(current: ShellTheme): ShellTheme {
  return current === "dark" ? "light" : "dark";
}

/** Attribute values a theme-toggle control applies for a given theme. */
export interface ShellThemeToggleAria {
  /** Whether the switch should report itself as checked (dark = on). */
  checked: boolean;
  /** Accessible label/title describing the action the toggle performs next. */
  label: string;
}

/**
 * Attribute values for a `role="switch"` theme toggle reflecting the theme
 * currently applied. A caller applies these to its own button element
 * (`aria-checked`, `aria-label`, `title`) — this computes values only, it
 * never touches the DOM.
 * @param theme The theme currently applied.
 * @returns `checked` and `label` to apply to the toggle control.
 */
export function themeToggleAria(theme: ShellTheme): ShellThemeToggleAria {
  const next = nextTheme(theme);
  return { checked: theme === "dark", label: `Switch to ${next} theme` };
}
