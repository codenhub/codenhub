import { canonicalizeTag, languageAndScript, maximizeTag } from "./likely-subtags";

// Languages compared as one. `no` is the Norwegian macrolanguage, and browsers and content use it for Bokmål, `nb`,
// as CLDR does; `Intl.Locale` keeps them apart. Nynorsk, `nn`, is a separate written standard and stays apart.
const LANGUAGE_ALIASES: ReadonlyMap<string, string> = new Map([["no", "nb"]]);

/**
 * The longest preference read. `Intl.Locale` parses a run of variants in quadratic time, so one `Accept-Language` tag of
 * 16 KB, which Node.js accepts as a header, cost about 25 ms a match; real tags are far shorter.
 */
const MAX_PREFERENCE_LENGTH = 255;

const SCRIPT_PATTERN = /^[a-z]{4}$/;

const compareLanguage = (language: string): string => LANGUAGE_ALIASES.get(language) ?? language;

// A lowercased tag with its language as `compareLanguage` gives it, such as `nb-no` for `no-NO`.
const aliasLanguage = (tag: string): string => {
  const lowercased = tag.toLowerCase();
  const end = lowercased.indexOf("-");
  const language = end === -1 ? lowercased : lowercased.slice(0, end);
  const alias = LANGUAGE_ALIASES.get(language);
  return alias === undefined ? lowercased : `${alias}${lowercased.slice(language.length)}`;
};

// A tag as two locales are compared for one language: canonicalized as `Intl` does, so a deprecated code such as `iw`
// reads as its replacement, `he`, then lowercased with its language as `compareLanguage` gives it, so `iw-IL` is
// `he-il` and `no-NO` is `nb-no`. A tag `Intl` rejects, such as private-use `x-test`, is only lowercased and aliased.
const comparableTag = (tag: string): string => aliasLanguage(canonicalizeTag(tag) ?? tag);

/**
 * Adds likely subtags, such as `zh-TW` to `zh-Hant-TW`, with the language compared as `compareLanguage` gives it, or
 * returns undefined for a tag `Intl.Locale` rejects.
 */
const maximizeLocale = (value: string): string | undefined => {
  const maximized = maximizeTag(value);
  return maximized === undefined ? undefined : aliasLanguage(maximized);
};

/** A configured locale with the forms matching and fallback chains compare, computed once per list. @internal */
export interface PreparedLocale<TLocale extends string> {
  readonly locale: TLocale;
  /** As `comparableTag` gives it, such as `he-il` for `iw-IL`, for finding parents. */
  readonly comparable: string;
  /** The locale lowercased, and as `aliasLanguage` gives it, each with a `-` for a whole-subtag prefix test. */
  readonly prefix: string;
  readonly aliasedPrefix: string;
  /** With likely subtags, as `maximizeLocale` gives it, and its language and script; undefined when `Intl` rejects it. */
  readonly maximized: string | undefined;
  readonly likely: string | undefined;
  /** For a locale `Intl.Locale` rejects: its language as compared, and the script it names, if any. */
  readonly language: string;
  readonly script: string | undefined;
}

/** @internal */
export interface PreparedLocales<TLocale extends string> {
  readonly exact: ReadonlyMap<string, TLocale>;
  readonly entries: readonly PreparedLocale<TLocale>[];
}

// Keyed by the list, which a manager keeps for its lifetime, so each locale's forms are computed once per manager.
const preparedLists = new WeakMap<readonly string[], PreparedLocales<string>>();

/**
 * The forms of each configured locale that {@link matchConfiguredLocale} and fallback chains compare, computed on first
 * use of this list and kept while the list is.
 *
 * @internal
 */
export const prepareLocales = <TLocale extends string>(locales: readonly TLocale[]): PreparedLocales<TLocale> => {
  const cached = preparedLists.get(locales) as PreparedLocales<TLocale> | undefined;
  if (cached !== undefined) {
    return cached;
  }

  const exact = new Map<string, TLocale>();
  const entries = locales.map((locale): PreparedLocale<TLocale> => {
    const lowercased = locale.toLowerCase();
    if (!exact.has(lowercased)) {
      exact.set(lowercased, locale);
    }
    const maximized = maximizeLocale(locale);
    const [language = "", second] = lowercased.split("-");
    return {
      locale,
      comparable: comparableTag(locale),
      prefix: `${lowercased}-`,
      aliasedPrefix: `${aliasLanguage(locale)}-`,
      maximized,
      likely: maximized === undefined ? undefined : languageAndScript(maximized),
      language: compareLanguage(language),
      script: second !== undefined && SCRIPT_PATTERN.test(second) ? second : undefined,
    };
  });
  const prepared: PreparedLocales<TLocale> = { exact, entries };
  preparedLists.set(locales, prepared);
  return prepared;
};

// The longest locale whose prefix the tag starts with, written in the tag's likely script when the locale has one.
const findPrefixLocale = <TLocale extends string>(
  entries: readonly PreparedLocale<TLocale>[],
  tag: string,
  likely: string,
  prefixOf: (entry: PreparedLocale<TLocale>) => string,
): TLocale | undefined => {
  let longest: TLocale | undefined;
  for (const entry of entries) {
    if (
      tag.startsWith(prefixOf(entry)) &&
      (entry.likely === undefined || entry.likely === likely) &&
      entry.locale.length > (longest?.length ?? 0)
    ) {
      longest = entry.locale;
    }
  }
  return longest;
};

/**
 * Matches ordered locale preferences, such as `navigator.languages` or a parsed `Accept-Language`, to a configured
 * locale: exact, then the longest whole-subtag prefix with the same likely script, then likely subtags, then the same
 * language and likely script. A locale whose likely script differs never matches, so `zh-TW` tries the next preference
 * rather than Simplified `zh`. A locale `Intl.Locale` rejects matches by language subtag, and by the script it names
 * when it names one. `no` and `nb` are compared as one language, Norwegian Bokmål. A preference whose language is `und`
 * names no language and is skipped unless a configured locale is that exact tag. An underscore reads as a hyphen, so
 * `pt_BR`, as iOS, Android, and POSIX write it, is `pt-BR`. A preference longer than 255 characters is skipped unread.
 * Among configured locales of the same language and script, the first in `locales` wins when none matches exactly or by
 * likely region, so `es-MX` matches `es-419` when it is listed before `es-ES`, while `en` matches `en-US`, its likely
 * region, wherever it is listed. Each locale's forms are computed once per list, as {@link prepareLocales} keeps them.
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
  const { exact, entries } = prepareLocales(locales);

  for (const preference of preferences) {
    if (typeof preference !== "string" || preference.length > MAX_PREFERENCE_LENGTH) {
      continue;
    }

    const normalizedPreference = preference.replaceAll("_", "-").trim().toLowerCase();

    // `und` names no language, yet likely subtags turn it into `en-Latn-US`, so it is no preference at all, unless a
    // configured locale is that exact tag.
    if (normalizedPreference.length === 0) {
      continue;
    }

    const exactLocale = exact.get(normalizedPreference);

    if (exactLocale !== undefined) {
      return exactLocale;
    }

    if (normalizedPreference.split("-")[0] === "und") {
      continue;
    }

    const maximizedPreference = maximizeLocale(normalizedPreference);

    // A tag `Intl.Locale` rejects, such as `en-`, is malformed and must not match through its prefix or language.
    if (maximizedPreference === undefined) {
      continue;
    }

    const likelyPreference = languageAndScript(maximizedPreference);

    // A prefix with another likely script, such as `zh` (Simplified) for `zh-TW`, is left to the script match below.
    // The prefix as written wins over one through a language alias, so `nb-NO` gets `nb` even when `no` is listed first.
    const prefixLocale =
      findPrefixLocale(entries, normalizedPreference, likelyPreference, (entry) => entry.prefix) ??
      findPrefixLocale(entries, aliasLanguage(normalizedPreference), likelyPreference, (entry) => entry.aliasedPrefix);

    if (prefixLocale !== undefined) {
      return prefixLocale;
    }

    const likelyLocale =
      entries.find(({ maximized }) => maximized === maximizedPreference) ??
      entries.find(({ likely }) => likely === likelyPreference);

    if (likelyLocale !== undefined) {
      return likelyLocale.locale;
    }

    // The same language in another likely script, such as `zh-Hant` for `zh`, reads worse than the next preference.
    // A locale `Intl.Locale` rejects has no likely script, so only the script it names, if any, is compared.
    const [language, script] = likelyPreference.split("-");
    const subtagLocale = entries.find(
      (entry) =>
        entry.maximized === undefined &&
        entry.language === language &&
        (entry.script === undefined || entry.script === script),
    )?.locale;

    if (subtagLocale !== undefined) {
      return subtagLocale;
    }
  }

  return undefined;
}
