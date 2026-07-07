import { normalizeValue } from "./helpers";
import { createEmptyDictionary } from "./locale-loader";
import type { I18nConfig, ResolvedLocaleState, ResolveLocaleStateOptions } from "./types";

const matchLocaleIgnoreCase = <TLocale extends string>(
  config: I18nConfig<TLocale>,
  value: string,
): TLocale | undefined => {
  const normalized = value.toLowerCase();

  return config.locales.find((locale) => locale.toLowerCase() === normalized);
};

const detectBrowserLocale = <TLocale extends string>(config: I18nConfig<TLocale>): TLocale | undefined => {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const languages = navigator.languages?.length ? [...navigator.languages] : [navigator.language];
  const validLanguages = languages.filter(Boolean);

  for (const lang of validLanguages) {
    const exactMatch = matchLocaleIgnoreCase(config, lang);

    if (exactMatch !== undefined) {
      return exactMatch;
    }

    const subtag = lang.split("-")[0]?.toLowerCase();

    if (subtag === undefined || subtag.length === 0) {
      continue;
    }

    const exactSubtagMatch = config.locales.find((locale) => locale.toLowerCase() === subtag);

    if (exactSubtagMatch !== undefined) {
      return exactSubtagMatch;
    }

    const prefixMatch = config.locales.find((locale) => locale.toLowerCase().startsWith(`${subtag}-`));

    if (prefixMatch !== undefined) {
      return prefixMatch;
    }
  }

  return undefined;
};

/**
 * Resolves the initial locale based on stored user preferences or browser locale settings.
 *
 * @param config - The translation config.
 * @param persistedLocale - The previously saved locale code, if any.
 * @returns The resolved initial locale code.
 * @internal
 */
export const getInitialLocale = <TLocale extends string>(
  config: I18nConfig<TLocale>,
  persistedLocale: string | undefined,
): TLocale => {
  const isLocale =
    config.isLocale ?? ((val: string): val is TLocale => (config.locales as readonly string[]).includes(val));

  if (persistedLocale !== undefined && isLocale(persistedLocale)) {
    return persistedLocale;
  }

  return detectBrowserLocale(config) ?? config.defaultLocale;
};

/**
 * Normalizes and matches a locale code case-insensitively.
 *
 * @param config - The translation config.
 * @param locale - The raw locale code to check.
 * @returns The matching configured locale code, or undefined.
 * @internal
 */
export const normalizeLocale = <TLocale extends string>(
  config: I18nConfig<TLocale>,
  locale: string,
): TLocale | undefined => {
  const normalizedLocale = normalizeValue(locale);

  if (normalizedLocale === undefined) {
    return undefined;
  }

  return matchLocaleIgnoreCase(config, normalizedLocale);
};

/**
 * Resolves the translation dictionary and loaded state for a given locale.
 * Falls back to the default locale if loading fails.
 *
 * @param config - The translation config.
 * @param loader - The locale loader manager.
 * @param requestedLocale - The locale code that was requested.
 * @returns A promise resolving to the next active state.
 * @internal
 */
export const resolveLocaleState = async <TLocale extends string>({
  config,
  loader,
  requestedLocale,
}: ResolveLocaleStateOptions<TLocale>): Promise<ResolvedLocaleState<TLocale>> => {
  if (typeof window === "undefined") {
    return {
      locale: requestedLocale,
      dictionary: createEmptyDictionary(),
      isRequestedLocaleLoaded: false,
      isAppliedLocaleLoaded: false,
    };
  }

  const requestedDictionary = await loader.loadLocale(requestedLocale);

  if (requestedDictionary !== undefined) {
    return {
      locale: requestedLocale,
      dictionary: requestedDictionary,
      isRequestedLocaleLoaded: true,
      isAppliedLocaleLoaded: Object.keys(requestedDictionary).length > 0,
    };
  }

  if (requestedLocale === config.defaultLocale) {
    console.warn(
      `[I18n] Default locale "${config.defaultLocale}" could not be loaded. Translations will be unavailable.`,
    );

    return {
      locale: config.defaultLocale,
      dictionary: createEmptyDictionary(),
      isRequestedLocaleLoaded: false,
      isAppliedLocaleLoaded: false,
    };
  }

  console.warn(
    `[I18n] Falling back to default locale "${config.defaultLocale}" because locale "${requestedLocale}" could not be loaded.`,
  );

  const recoveredDefaultDictionary = await loader.loadLocale(config.defaultLocale);

  if (recoveredDefaultDictionary === undefined) {
    console.warn(
      `[I18n] Default locale "${config.defaultLocale}" also failed to load. Translations will be unavailable.`,
    );

    return {
      locale: config.defaultLocale,
      dictionary: createEmptyDictionary(),
      isRequestedLocaleLoaded: false,
      isAppliedLocaleLoaded: false,
    };
  }

  return {
    locale: config.defaultLocale,
    dictionary: recoveredDefaultDictionary,
    isRequestedLocaleLoaded: false,
    isAppliedLocaleLoaded: Object.keys(recoveredDefaultDictionary).length > 0,
  };
};
