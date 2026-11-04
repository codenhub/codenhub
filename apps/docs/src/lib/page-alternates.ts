import type { Locale } from "../i18n";

/** One language version of a page, as `hreflang` alternates name it. */
export interface PageAlternate {
  /** The version's locale, or `x-default` for the page a reader in any other language gets. */
  lang: Locale | "x-default";
  route: string;
}

/**
 * The `hreflang` alternates every version of a translated page carries: each
 * version, itself included, then `x-default` on the English page, the default
 * for readers whose language is not offered
 * (`docs/specs/packages-translations.md`, "Documentation site").
 * @param english The English page.
 * @param translations Its translations.
 * @returns The alternates, or none for a page without a translation.
 */
export function pageAlternates(
  english: { route: string },
  translations: readonly { lang: Locale; route: string }[],
): PageAlternate[] {
  if (translations.length === 0) {
    return [];
  }
  return [
    { lang: "en", route: english.route },
    ...translations.map(({ lang, route }) => ({ lang, route })),
    { lang: "x-default", route: english.route },
  ];
}
