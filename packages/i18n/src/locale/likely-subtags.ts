// `Intl.Locale.prototype.maximize()` costs about 5 µs a tag on Node.js 26.13, and creating a manager and matching a
// request each read every configured locale, so the results are kept across managers. The tags come from
// configurations and from `Accept-Language`, so the cache is bounded in entries, and a tag longer than any common one
// is computed without being kept.
const MAX_CACHED_TAGS = 1_000;
const MAX_CACHED_TAG_LENGTH = 64;
// `null` is a tag `Intl.Locale` rejects, so a miss and a rejected tag differ.
const maximizedTags = new Map<string, string | null>();

/**
 * Adds likely subtags to a tag, lowercased, such as `zh-hant-tw` for `zh-TW`, or returns `undefined` for a tag
 * `Intl.Locale` rejects, such as private-use `x-test`. Results are shared by every manager, least recently used first
 * out.
 *
 * @internal
 */
export const maximizeTag = (tag: string): string | undefined => {
  const cached = maximizedTags.get(tag);

  if (cached !== undefined) {
    maximizedTags.delete(tag);
    maximizedTags.set(tag, cached);
    return cached ?? undefined;
  }

  let maximized: string | null;
  try {
    maximized = new Intl.Locale(tag).maximize().toString().toLowerCase();
  } catch {
    maximized = null;
  }
  if (tag.length <= MAX_CACHED_TAG_LENGTH) {
    if (maximizedTags.size >= MAX_CACHED_TAGS) {
      maximizedTags.delete(maximizedTags.keys().next().value!);
    }
    maximizedTags.set(tag, maximized);
  }
  return maximized ?? undefined;
};

/**
 * How many tags {@link maximizeTag} keeps, for tests.
 *
 * @internal
 */
export const cachedTagCount = (): number => maximizedTags.size;
