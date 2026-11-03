/** The language and script of a locale with likely subtags added, such as `zh-hant` for `zh-TW`. */
const likelyScript = (locale: string): string | undefined => {
  try {
    return new Intl.Locale(locale).maximize().toString().toLowerCase().split("-").slice(0, 2).join("-");
  } catch {
    // A tag `Intl.Locale` rejects, such as private-use `x-test`, has no likely script to compare.
    return undefined;
  }
};

/**
 * Lists the locales whose dictionaries a locale reads, in order: itself, each configured parent made by dropping
 * subtags, such as `pt` for `pt-BR`, then the default. A parent with another likely script is skipped, so `zh-Hant`
 * never falls back to `zh`, which is Simplified Chinese.
 *
 * @internal
 */
export const createFallbackChains = <TLocale extends string>(
  locales: readonly TLocale[],
  defaultLocale: TLocale,
): ReadonlyMap<TLocale, readonly TLocale[]> => {
  const lookup = new Map(locales.map((locale) => [locale.toLowerCase(), locale]));

  return new Map(
    locales.map((locale) => {
      const chain = [locale];
      const script = likelyScript(locale);
      const subtags = locale.split("-");

      for (let length = subtags.length - 1; length > 0; length -= 1) {
        const parent = lookup.get(subtags.slice(0, length).join("-").toLowerCase());
        const parentScript = parent === undefined ? undefined : likelyScript(parent);

        if (parent !== undefined && (script === undefined || parentScript === undefined || parentScript === script)) {
          chain.push(parent);
        }
      }
      if (!chain.includes(defaultLocale)) {
        chain.push(defaultLocale);
      }

      return [locale, Object.freeze(chain)];
    }),
  );
};
