/**
 * The site's languages, following the main site's URL scheme
 * (`apps/www/src/i18n/index.ts`): English at the root and each other locale
 * under its own prefix. A locale page exists only for a translated document
 * (`docs/specs/packages-translations.md`, "Documentation site"), but its
 * interface is always in that locale.
 */
import { TRANSLATION_LOCALES, type TranslationLocale } from "@codenhub/tools/documentation";

import { en, type Dictionary } from "./locales/en";
import { es } from "./locales/es";
import { ptBR } from "./locales/pt-br";

export type { Dictionary } from "./locales/en";

/** A page language: English, or a locale packages may translate into. */
export type Locale = "en" | TranslationLocale;

export const defaultLocale = "en" satisfies Locale;

/** Every page language, English first. */
export const locales: readonly Locale[] = [defaultLocale, ...TRANSLATION_LOCALES];

const dictionaries: Record<Locale, Dictionary> = { en, es, "pt-BR": ptBR };

/**
 * The interface text for a page language.
 * @param locale The page's language.
 * @returns That language's dictionary.
 */
export function messagesFor(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/**
 * Prefixes a site path with a locale, leaving English at the root.
 * @param locale The page's language.
 * @param path A root-relative path such as `/search-index.json`.
 * @returns The path under the locale's prefix.
 */
export function localizePath(locale: Locale, path: string): string {
  return locale === defaultLocale ? path : `/${locale}${path}`;
}
