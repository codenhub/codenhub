/**
 * The languages every CodenHub site is offered in, and how a visitor's choice
 * of one is remembered across them.
 *
 * English is the source language and lives at each site's root; every other
 * locale is a translation locale (`docs/specs/packages-translations.md`,
 * "Languages") under its own URL prefix.
 */
import { TRANSLATION_LOCALES, type TranslationLocale } from "@codenhub/tools/documentation";

/** A site language: English, or a locale packages may translate into. */
export type SiteLocale = "en" | TranslationLocale;

/** The language each site serves at its root. */
export const DEFAULT_LOCALE = "en" satisfies SiteLocale;

/** Every site language, English first, in the order the language menu lists them. */
export const SITE_LOCALES: readonly SiteLocale[] = [DEFAULT_LOCALE, ...TRANSLATION_LOCALES];

/** Each language's name in itself, as the language menu lists it. */
export const LOCALE_NAMES: Readonly<Record<SiteLocale, string>> = {
  en: "English",
  "pt-BR": "Português (Brasil)",
  es: "Español",
};

/**
 * The cookie the language menu saves a visitor's choice in. A cookie rather
 * than `localStorage`, which each origin keeps to itself: scoped to the shared
 * parent domain, one choice reaches `codenhub.dev` and `docs.codenhub.dev`.
 */
export const LOCALE_COOKIE = "codenhub-locale";

/** The domain every CodenHub site is served under, which the locale cookie is scoped to. */
export const LOCALE_COOKIE_DOMAIN = "codenhub.dev";

/**
 * Prefixes a root-relative path with a locale, leaving English at the root.
 * @param locale The page's language.
 * @param path A root-relative path such as `/packages/`.
 * @returns The path under the locale's prefix.
 */
export function localizePath(locale: SiteLocale, path: string): string {
  return locale === DEFAULT_LOCALE ? path : `/${locale}${path}`;
}

/**
 * Moves an absolute URL on a CodenHub site under a locale's prefix, for a link
 * to another site whose every page exists in every locale.
 * @param url An absolute URL to an English page, such as `https://docs.codenhub.dev/icons/`.
 * @param locale The language to link it in.
 * @returns The URL in that language.
 */
export function localizeUrl(url: string, locale: SiteLocale): string {
  const localized = new URL(url);
  localized.pathname = localizePath(locale, localized.pathname);
  return localized.href;
}

/**
 * The locale to send a visitor arriving at an English page to: the one they
 * chose, else the first of their browser's languages the site has, matched by
 * language alone since the site has one locale per language. The inline
 * redirect (`components/locale-redirect.astro`) mirrors this, since an inline
 * script cannot import.
 * @param chosen The saved choice, or null.
 * @param preferences The browser's languages, most preferred first.
 * @param locales The site's locales.
 * @returns The locale, or undefined when none matches.
 */
export function pickArrivalLocale(
  chosen: string | null,
  preferences: readonly string[],
  locales: readonly string[] = SITE_LOCALES,
): string | undefined {
  if (chosen !== null && locales.includes(chosen)) {
    return chosen;
  }
  for (const preference of preferences) {
    const language = preference.split("-")[0]?.toLowerCase() ?? "";
    const match = locales.find((locale) => locale.split("-")[0]?.toLowerCase() === language);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}

/**
 * The `document.cookie` assignment that saves a locale choice for a year.
 * Scoped to `domain` when the page is served under it, and to the current host
 * otherwise (local builds, previews), where a foreign `Domain` would be rejected.
 * @param locale The chosen locale.
 * @param hostname This page's host name.
 * @param domain The shared parent domain.
 * @returns The cookie string.
 */
export function localeCookie(locale: string, hostname: string, domain: string): string {
  const scope = hostname === domain || hostname.endsWith(`.${domain}`) ? `; Domain=${domain}` : "";
  return `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax${scope}`;
}
