/**
 * The site's languages, shared with the main site (`@codenhub/app-shell/locales`):
 * English at the root and each other locale under its own prefix. Every page
 * exists in every locale; an untranslated one shows its English body inside
 * that locale's interface (`docs/specs/packages-translations.md`,
 * "Documentation site").
 */
import { DEFAULT_LOCALE, type SiteLocale } from "@codenhub/app-shell/locales";

import { en, type Dictionary } from "./locales/en";
import { es } from "./locales/es";
import { ptBR } from "./locales/pt-br";

export type { Dictionary } from "./locales/en";
export { LOCALE_NAMES as localeNames, SITE_LOCALES as locales, localizePath } from "@codenhub/app-shell/locales";

/** A page language: English, or a locale packages may translate into. */
export type Locale = SiteLocale;

export const defaultLocale = DEFAULT_LOCALE;

const dictionaries: Record<Locale, Dictionary> = { en, es, "pt-BR": ptBR };

/**
 * The interface text for a page language.
 * @param locale The page's language.
 * @returns That language's dictionary.
 */
export function messagesFor(locale: Locale): Dictionary {
  return dictionaries[locale];
}
