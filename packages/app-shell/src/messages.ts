/**
 * Every piece of text the shell renders, so a surface can show its chrome in
 * the reader's language. A surface passes a whole set to the base layout, and
 * to the components it renders itself, such as the search palette; leaving it
 * out keeps English.
 *
 * Texts are plain strings. A `{name}` placeholder is filled by the shell with
 * {@link fillMessage}; a surface that builds these from a translation library
 * leaves the placeholder as written for the shell to fill.
 */
export interface ShellMessages {
  /** The skip link before the header. */
  skipToContent: string;
  /** The header's brand link. `{site}` is the site title. */
  home: string;
  /** The header's nav landmark. */
  sitesNav: string;
  /** Cross-surface nav link labels. */
  nav: { documentation: string; demo: string };
  /** The header's GitHub and npm actions, unless the page passes its own labels. */
  github: string;
  npm: string;
  theme: {
    /** The switch's label before its script runs. */
    toggle: string;
    /** The switch's label in the light theme, naming what a press does. */
    toDark: string;
    /** The switch's label in the dark theme. */
    toLight: string;
  };
  /** The footer's credit, before the link to coden. */
  builtBy: string;
  status: { deprecated: string; experimental: string };
  copy: { copied: string; failed: string; retry: string };
  search: {
    /** The header trigger's visible text. */
    trigger: string;
    /** The trigger's and the dialog's accessible name, and the field's placeholder. */
    label: string;
    results: string;
    idle: string;
    unavailable: string;
    /** `{query}` is what the reader typed. */
    empty: string;
    /** `{count}` is the number of results; the form is picked with `Intl.PluralRules`. */
    count: { one: string; other: string };
  };
}

export const defaultShellMessages: ShellMessages = {
  skipToContent: "Skip to main content",
  home: "{site} home",
  sitesNav: "Sites",
  nav: { documentation: "Documentation", demo: "Demo" },
  github: "CodenHub on GitHub",
  npm: "CodenHub on npm",
  theme: { toggle: "Switch theme", toDark: "Switch to dark theme", toLight: "Switch to light theme" },
  builtBy: "Built by",
  status: { deprecated: "Deprecated", experimental: "Experimental" },
  copy: { copied: "Copied", failed: "Copy failed", retry: "Copy failed. Try again" },
  search: {
    trigger: "Search",
    label: "Search documentation",
    results: "Search results",
    idle: "Type to search every package document.",
    unavailable: "Search is unavailable right now. Try again in a moment.",
    empty: "No documentation matches “{query}”.",
    count: {
      one: "{count} result. Use the arrow keys to choose one.",
      other: "{count} results. Use the arrow keys to choose one.",
    },
  },
};

/**
 * Fills `{name}` placeholders. A placeholder without a value is left as written.
 * @param message The text, such as `{count} results`.
 * @param values The value for each placeholder.
 * @returns The filled text.
 */
export function fillMessage(message: string, values: Readonly<Record<string, string | number>>): string {
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
