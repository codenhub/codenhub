import { prepareLocales } from "./matching";

/**
 * Lists the locales whose dictionaries a locale reads, in order: itself, each configured parent made by dropping
 * subtags, such as `pt` for `pt-BR`, then the configured locale named by its likely language and script, such as
 * `zh-Hant` for `zh-HK`, then the default. A parent with another likely script is skipped, so `zh-Hant` never falls back
 * to `zh`, which is Simplified Chinese. Locales are compared as matching compares them, in their canonical form with `no`
 * read as `nb`, so `he-IL` finds a configured `iw` as its parent and `nb-NO` finds `no`. A tag `Intl.Locale` rejects,
 * such as private-use `x-test`, has no likely script to compare.
 *
 * @internal
 */
export const createFallbackChains = <TLocale extends string>(
  locales: readonly TLocale[],
  defaultLocale: TLocale,
): ReadonlyMap<TLocale, readonly TLocale[]> => {
  const { entries } = prepareLocales(locales);

  // Keyed by the form locales are compared in, so `he-IL` finds `iw` as its parent. The first listed wins.
  const lookup = new Map<string, TLocale>();
  for (const { locale, comparable } of entries) {
    if (!lookup.has(comparable)) {
      lookup.set(comparable, locale);
    }
  }
  const scripts = new Map(entries.map(({ locale, likely }) => [locale, likely]));

  return new Map(
    entries.map(({ locale, comparable, likely: script }) => {
      const chain = [locale];
      const subtags = comparable.split("-");

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
