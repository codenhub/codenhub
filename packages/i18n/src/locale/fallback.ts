import { languageAndScript, maximizeTag } from "./likely-subtags";
import { comparableTag } from "./matching";

/**
 * The language and script of a locale with likely subtags added, compared as {@link comparableTag} gives them, such as
 * `zh-hant` for `zh-TW` and `nb-latn` for `no`. A tag `Intl.Locale` rejects, such as private-use `x-test`, has no likely
 * script to compare.
 */
const likelyScript = (locale: string): string | undefined => {
  const maximized = maximizeTag(locale);
  return maximized === undefined ? undefined : comparableTag(languageAndScript(maximized));
};

/**
 * Lists the locales whose dictionaries a locale reads, in order: itself, each configured parent made by dropping
 * subtags, such as `pt` for `pt-BR`, then the configured locale named by its likely language and script, such as
 * `zh-Hant` for `zh-HK`, then the default. A parent with another likely script is skipped, so `zh-Hant` never falls back
 * to `zh`, which is Simplified Chinese. Locales are compared as {@link comparableTag} gives them, so `he-IL` finds a
 * configured `iw` as its parent and `nb-NO` finds `no`.
 *
 * @internal
 */
export const createFallbackChains = <TLocale extends string>(
  locales: readonly TLocale[],
  defaultLocale: TLocale,
): ReadonlyMap<TLocale, readonly TLocale[]> => {
  // Keyed by the form locales are compared in, so `he-IL` finds `iw` as its parent. The first listed wins.
  const lookup = new Map<string, TLocale>();
  for (const locale of locales) {
    const key = comparableTag(locale);
    if (!lookup.has(key)) {
      lookup.set(key, locale);
    }
  }

  const scripts = new Map(locales.map((locale) => [locale, likelyScript(locale)]));

  return new Map(
    locales.map((locale) => {
      const chain = [locale];
      const script = scripts.get(locale);
      const subtags = comparableTag(locale).split("-");

      for (let length = subtags.length - 1; length > 0; length -= 1) {
        const parent = lookup.get(subtags.slice(0, length).join("-"));
        const parentScript = parent === undefined ? undefined : scripts.get(parent);

        if (parent !== undefined && (script === undefined || parentScript === undefined || parentScript === script)) {
          chain.push(parent);
        }
      }
      // The parent `matchLocale()` reads too: `zh-MO` matches `zh-Hant`, so `zh-HK` falls back to it.
      const scriptParent = script === undefined ? undefined : lookup.get(script);
      if (scriptParent !== undefined && !chain.includes(scriptParent)) {
        chain.push(scriptParent);
      }
      if (!chain.includes(defaultLocale)) {
        chain.push(defaultLocale);
      }

      return [locale, Object.freeze(chain)];
    }),
  );
};
