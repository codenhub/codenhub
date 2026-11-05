/**
 * The site's languages. English lives at the root and every other locale under
 * its own prefix, as in `/pt-BR/packages/`, so every page is built once per
 * locale and each language has a URL to share and index.
 */
import type { ShellMessages } from "@codenhub/app-shell/messages";
import { createI18n } from "@codenhub/i18n";
import { createLocaleRouting } from "@codenhub/i18n/routing";

import { en, type Dictionary } from "./locales/en";
import { es } from "./locales/es";
import { ptBR } from "./locales/pt-br";

export const locales = ["en", "pt-BR", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Each locale's name in its own language, as the language menu lists it. */
export const localeNames: Record<Locale, string> = { en: "English", "pt-BR": "Português (Brasil)", es: "Español" };

const dictionaries: Record<Locale, Dictionary> = { en, "pt-BR": ptBR, es };

/** Where the language menu saves the visitor's choice, which wins over their browser's languages. */
export const LOCALE_STORAGE_KEY = "www-locale";

/** Each locale by its language subtag, such as `pt` for `pt-BR`; one locale per language. */
export const localesByLanguage: Record<string, Locale> = Object.fromEntries(
  locales.map((locale) => [new Intl.Locale(locale).language, locale]),
);

/**
 * The locale for a visitor's browser languages, matched by language alone,
 * which with one locale per language picks what the manager's `matchLocale`
 * would. The base layout's inline redirect mirrors this, since an inline
 * script cannot import; the tests hold the two to the manager.
 * @param preferences The visitor's languages, most preferred first, such as `navigator.languages`.
 * @returns The first one the site has, or undefined.
 */
export function detectLocale(preferences: readonly string[]): Locale | undefined {
  for (const preference of preferences) {
    const language = preference.split("-")[0]?.toLowerCase() ?? "";
    if (Object.hasOwn(localesByLanguage, language)) {
      return localesByLanguage[language];
    }
  }

  return undefined;
}

export const routing = createLocaleRouting({ locales, defaultLocale, localePrefix: "except-default" });

const createTranslator = async (locale: Locale) => {
  const i18n = createI18n({
    locales,
    defaultLocale,
    loadLocale: (target): Dictionary => dictionaries[target],
    // A key missing from every dictionary fails the build rather than
    // publishing the key as text.
    onMissingKey(key, target) {
      throw new Error(`Missing translation "${key}" in ${target}`);
    },
  });
  await i18n.init({ locale });

  return i18n;
};

export type Translator = Awaited<ReturnType<typeof createTranslator>>;

// Every page of a locale reads the same dictionary, so the build starts one
// manager per locale rather than one per page.
const translators = new Map<Locale, Promise<Translator>>();

/**
 * The translation manager for a locale, ready to translate.
 * @param locale The page's locale.
 * @returns The manager; its `t` is bound and can be pulled off.
 */
export function getTranslator(locale: Locale): Promise<Translator> {
  let translator = translators.get(locale);
  if (translator === undefined) {
    translator = createTranslator(locale);
    translators.set(locale, translator);
  }

  return translator;
}

/**
 * The `getStaticPaths` entries for a page built once per locale under a
 * `[...locale]` route: the default locale at the root, the others under their
 * prefix.
 * @returns One entry per locale, with the locale as a prop.
 */
export function localeStaticPaths(): { params: { locale: string | undefined }; props: { locale: Locale } }[] {
  return locales.map((locale) => ({
    params: { locale: locale === defaultLocale ? undefined : locale },
    props: { locale },
  }));
}

/**
 * The shell's text in a locale. Placeholders such as `{site}` are left for
 * the shell to fill.
 * @param t The locale's translate function.
 * @returns Everything the base layout and search palette render.
 */
export function shellMessages(t: Translator["t"]): ShellMessages {
  return {
    skipToContent: t("shell.skipToContent"),
    home: t("shell.home"),
    sitesNav: t("shell.sitesNav"),
    nav: { documentation: t("shell.nav.documentation"), demo: t("shell.nav.demo") },
    github: t("shell.github"),
    npm: t("shell.npm"),
    theme: { toggle: t("shell.theme.toggle"), toDark: t("shell.theme.toDark"), toLight: t("shell.theme.toLight") },
    builtBy: t("shell.builtBy"),
    status: { deprecated: t("shell.status.deprecated"), experimental: t("shell.status.experimental") },
    copy: { copied: t("shell.copy.copied"), failed: t("shell.copy.failed"), retry: t("shell.copy.retry") },
    search: {
      trigger: t("shell.search.trigger"),
      label: t("shell.search.label"),
      results: t("shell.search.results"),
      idle: t("shell.search.idle"),
      unavailable: t("shell.search.unavailable"),
      empty: t("shell.search.empty"),
      count: { one: t("shell.search.countOne"), other: t("shell.search.countOther") },
    },
  };
}
