import { normalizeValue } from "./helpers";
import { createEmptyDictionary, type LocaleLoader } from "./locale-loader";
import type { I18nConfig, ResolvedLocaleState } from "./types";

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
  }

  for (const lang of validLanguages) {
    const subtag = lang.split("-")[0]?.toLowerCase();

    if (subtag === undefined || subtag.length === 0) {
      continue;
    }

    const match = config.locales.find((locale) => {
      const normalizedLocale = locale.toLowerCase();

      return normalizedLocale === subtag || normalizedLocale.startsWith(`${subtag}-`);
    });

    if (match !== undefined) {
      return match;
    }
  }

  return undefined;
};

export const getInitialLocale = <TLocale extends string>(
  config: I18nConfig<TLocale>,
  persistedLocale: string | undefined,
): TLocale => {
  if (persistedLocale !== undefined && config.isLocale(persistedLocale)) {
    return persistedLocale;
  }

  return detectBrowserLocale(config) ?? config.defaultLocale;
};

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

export const resolveLocaleState = async <TLocale extends string>(
  config: I18nConfig<TLocale>,
  loader: LocaleLoader<TLocale>,
  requestedLocale: TLocale,
): Promise<ResolvedLocaleState<TLocale>> => {
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
