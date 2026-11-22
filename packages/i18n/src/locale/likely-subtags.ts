// `Intl.Locale.prototype.maximize()` costs about 5 µs a tag on Node.js 26.13, and `Intl.getCanonicalLocales()` about as
// much, and creating a manager and matching a request each read every configured locale, so the results are kept across
// managers. The tags come from configurations and from `Accept-Language`, so each cache is bounded in entries, and a
// tag longer than any common one is computed without being kept.
const MAX_CACHED_TAGS = 1_000;
const MAX_CACHED_TAG_LENGTH = 64;

// Each cache maps a tag to what `compute` returns, with `null` for a tag `Intl` rejects, so a miss and a rejected tag
// differ. Least recently used first out.
const cacheTags = (
  compute: (tag: string) => string,
): ((tag: string) => string | undefined) & { size: () => number } => {
  const results = new Map<string, string | null>();
  const read = (tag: string): string | undefined => {
    const cached = results.get(tag);

    if (cached !== undefined) {
      results.delete(tag);
      results.set(tag, cached);
      return cached ?? undefined;
    }

    let result: string | null;
    try {
      result = compute(tag);
    } catch {
      result = null;
    }
    if (tag.length <= MAX_CACHED_TAG_LENGTH) {
      if (results.size >= MAX_CACHED_TAGS) {
        results.delete(results.keys().next().value!);
      }
      results.set(tag, result);
    }
    return result ?? undefined;
  };
  return Object.assign(read, { size: () => results.size });
};

const maximizedTags = cacheTags((tag) => new Intl.Locale(tag).maximize().baseName.toLowerCase());
// `getCanonicalLocales` throws for a rejected tag, so its result is always a string.
const canonicalTags = cacheTags((tag) => Intl.getCanonicalLocales(tag)[0]!);

/**
 * Adds likely subtags to a tag and drops its extensions, lowercased, such as `zh-hant-tw` for `zh-TW` or `es-latn-es` for
 * `es-u-hc-h23`, or returns `undefined` for a tag `Intl.Locale` rejects, such as private-use `x-test`. Results are shared
 * by every manager, least recently used first out.
 *
 * @internal
 */
export const maximizeTag = (tag: string): string | undefined => maximizedTags(tag);

/**
 * A tag as `Intl.getCanonicalLocales` writes it, such as `he-IL` for `iw-il`, or `undefined` for a tag it rejects, such
 * as `en-` or private-use `x-test`. Results are shared by every manager, as {@link maximizeTag}'s are.
 *
 * @internal
 */
export const canonicalizeTag = (tag: string): string | undefined => canonicalTags(tag);

/**
 * The language and script of a tag {@link maximizeTag} returned, such as `zh-hant` for `zh-hant-tw`, or the language
 * alone when likely subtags name no script, such as `nah` for `nah-mx`.
 *
 * @internal
 */
export const languageAndScript = (maximized: string): string => {
  const [language = "", second] = maximized.split("-");
  return second !== undefined && /^[a-z]{4}$/.test(second) ? `${language}-${second}` : language;
};

/**
 * How many tags {@link maximizeTag} and {@link canonicalizeTag} keep, for tests.
 *
 * @internal
 */
export const cachedTagCount = (): { maximized: number; canonical: number } => ({
  maximized: maximizedTags.size(),
  canonical: canonicalTags.size(),
});
