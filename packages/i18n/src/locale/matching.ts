import { resolveConfiguredLocale } from "./configured-locale";

/** Adds likely subtags, such as `zh-TW` to `zh-Hant-TW`, or returns undefined for a tag `Intl.Locale` rejects. */
const maximizeLocale = (value: string): string | undefined => {
  try {
    return new Intl.Locale(value).maximize().toString().toLowerCase();
  } catch {
    return undefined;
  }
};

const getLanguageAndScript = (maximizedLocale: string): string => maximizedLocale.split("-").slice(0, 2).join("-");

/**
 * Matches ordered locale preferences, such as `navigator.languages` or a parsed `Accept-Language`, to a configured
 * locale: exact, then the longest whole-subtag prefix with the same likely script, then likely subtags, then the same
 * language and likely script. A locale whose likely script differs never matches, so `zh-TW` tries the next preference
 * rather than Simplified `zh`. A locale `Intl.Locale` rejects matches by language subtag, and by the script it names
 * when it names one.
 * Among configured locales of the same language and script, the first in `locales` wins when none matches exactly or by
 * likely region, so `es-MX` matches `es-419` when it is listed before `es-ES`, while `en` matches `en-US`, its likely
 * region, wherever it is listed.
 *
 * @param locales - Canonical supported locales.
 * @param preferences - Untrusted preferences, most preferred first; non-strings are skipped.
 * @returns The canonical locale for the first preference that matches, or undefined.
 * @internal
 */
export function matchConfiguredLocale<TLocale extends string>(
  locales: readonly TLocale[],
  preferences: readonly string[],
): TLocale | undefined {
  const maximizedLocales = locales.map((locale) => ({ locale, maximized: maximizeLocale(locale) }));

  for (const preference of preferences) {
    if (typeof preference !== "string") {
      continue;
    }

    const exactLocale = resolveConfiguredLocale(locales, preference);

    if (exactLocale !== undefined) {
      return exactLocale;
    }

    const normalizedPreference = preference.trim().toLowerCase();

    if (normalizedPreference.length === 0) {
      continue;
    }

    const maximizedPreference = maximizeLocale(normalizedPreference);

    // A tag `Intl.Locale` rejects, such as `en-`, is malformed and must not match through its prefix or language.
    if (maximizedPreference === undefined) {
      continue;
    }

    // A prefix with another likely script, such as `zh` (Simplified) for `zh-TW`, is left to the script match below.
    const prefixLocale = maximizedLocales
      .filter(
        ({ locale, maximized }) =>
          normalizedPreference.startsWith(`${locale.toLowerCase()}-`) &&
          (maximized === undefined || getLanguageAndScript(maximized) === getLanguageAndScript(maximizedPreference)),
      )
      .map(({ locale }) => locale)
      .reduce<TLocale | undefined>(
        (longest, locale) => (locale.length > (longest?.length ?? 0) ? locale : longest),
        undefined,
      );

    if (prefixLocale !== undefined) {
      return prefixLocale;
    }

    const likelyLocale =
      maximizedLocales.find(({ maximized }) => maximized === maximizedPreference) ??
      maximizedLocales.find(
        ({ maximized }) =>
          maximized !== undefined && getLanguageAndScript(maximized) === getLanguageAndScript(maximizedPreference),
      );

    if (likelyLocale !== undefined) {
      return likelyLocale.locale;
    }

    // The same language in another likely script, such as `zh-Hant` for `zh`, reads worse than the next preference.
    // A locale `Intl.Locale` rejects has no likely script, so only the script it names, if any, is compared.
    const [language, script] = getLanguageAndScript(maximizedPreference).split("-");
    const subtagLocale = maximizedLocales.find(({ locale, maximized }) => {
      if (maximized !== undefined) {
        return false;
      }
      const [localeLanguage, second] = locale.toLowerCase().split("-");
      return localeLanguage === language && (second === undefined || !/^[a-z]{4}$/.test(second) || second === script);
    })?.locale;

    if (subtagLocale !== undefined) {
      return subtagLocale;
    }
  }

  return undefined;
}
