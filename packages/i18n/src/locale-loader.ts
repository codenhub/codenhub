/* oxlint-disable no-await-in-loop */
import type { I18nConfig, LocaleDictionary } from "./types";

const MAX_LOCALE_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 10_000;

/** Creates a dictionary object without prototype properties. */
export const createEmptyDictionary = (): LocaleDictionary => Object.create(null) as LocaleDictionary;

const isLocaleDictionary = (raw: unknown): raw is Record<string, unknown> => {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
};

const HTTP_STATUS_REQUEST_TIMEOUT = 408;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

const isRetryableStatus = (status: number): boolean =>
  status === HTTP_STATUS_REQUEST_TIMEOUT ||
  status === HTTP_STATUS_TOO_MANY_REQUESTS ||
  status >= HTTP_STATUS_INTERNAL_SERVER_ERROR;

/**
 * Interface for the locale file loader.
 *
 * @internal
 */
export interface LocaleLoader<TLocale extends string = string> {
  /** Clears the cache of permanently failed locales. */
  resetFailedCache(): void;
  /** Retries loading a specific locale, clearing it from the failed cache. */
  retryLocale(locale: TLocale): void;
  /** Fetches and caches the locale dictionary. */
  loadLocale(locale: TLocale): Promise<LocaleDictionary | undefined>;
}

/**
 * Creates a locale loader instance.
 *
 * @param config - The translation configuration.
 * @returns A locale loader instance.
 * @internal
 */
export function createLocaleLoader<TLocale extends string = string>(
  config: I18nConfig<TLocale>,
): LocaleLoader<TLocale> {
  const localeCache: Partial<Record<TLocale, LocaleDictionary>> = Object.create(null);
  const localeFetchCache: Partial<Record<TLocale, Promise<LocaleDictionary | undefined>>> = Object.create(null);
  let localeFailedCache = new Set<TLocale>();

  const delayBeforeRetry = (attempt: number): Promise<void> => {
    const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;

    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  };

  const fetchLocaleFile = async (
    localeFile: string,
  ): Promise<{ ok: false; status: number } | { ok: true; body: unknown }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(localeFile, { signal: controller.signal });

      if (!response.ok) {
        return { ok: false, status: response.status };
      }

      return { ok: true, body: await response.json() };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const fetchAndCacheLocale = async (locale: TLocale): Promise<LocaleDictionary | undefined> => {
    const localeFile = config.getLocaleFile(locale);

    try {
      for (let attempt = 0; attempt <= MAX_LOCALE_RETRIES; attempt++) {
        const isLastAttempt = attempt === MAX_LOCALE_RETRIES;

        try {
          const result = await fetchLocaleFile(localeFile);

          if (!result.ok) {
            const isPermanentFailure = !isRetryableStatus(result.status);

            if (!isLastAttempt && !isPermanentFailure) {
              await delayBeforeRetry(attempt);
              continue;
            }

            console.warn(`[I18n] Failed to load locale "${locale}" from "${localeFile}".`);

            if (isPermanentFailure) {
              localeFailedCache.add(locale);
            }

            return undefined;
          }

          if (!isLocaleDictionary(result.body)) {
            console.warn(`[I18n] Locale "${locale}" has an invalid dictionary shape.`);
            localeFailedCache.add(locale);
            return undefined;
          }

          const dictionary = createEmptyDictionary();

          for (const [key, val] of Object.entries(result.body)) {
            if (key === "__proto__" || key === "constructor") {
              continue;
            }
            if (typeof val !== "string") {
              console.warn(`[I18n] Non-string value found for key "${key}" in locale "${locale}". Coercing to string.`);
              dictionary[key] = String(val);
            } else {
              dictionary[key] = val;
            }
          }

          if (Object.keys(dictionary).length === 0) {
            console.warn(`[I18n] Locale "${locale}" loaded successfully but contains no translations.`);
            return dictionary;
          }

          localeCache[locale] = dictionary;
          return dictionary;
        } catch (error) {
          if (error instanceof SyntaxError) {
            console.warn(`[I18n] Locale "${locale}" returned malformed JSON.`);
            localeFailedCache.add(locale);
            return undefined;
          }

          if (!isLastAttempt) {
            await delayBeforeRetry(attempt);
            continue;
          }

          console.warn(`[I18n] Failed to fetch locale "${locale}":`, error);
          return undefined;
        }
      }
    } finally {
      delete localeFetchCache[locale];
    }

    return undefined;
  };

  return {
    resetFailedCache() {
      localeFailedCache = new Set<TLocale>();
    },

    retryLocale(locale: TLocale) {
      localeFailedCache.delete(locale);
    },

    loadLocale(locale: TLocale) {
      const cachedDictionary = localeCache[locale];

      if (cachedDictionary !== undefined) {
        return Promise.resolve(cachedDictionary);
      }

      if (localeFailedCache.has(locale)) {
        return Promise.resolve(undefined);
      }

      const inflight = localeFetchCache[locale];

      if (inflight !== undefined) {
        return inflight;
      }

      const promise = fetchAndCacheLocale(locale);
      localeFetchCache[locale] = promise;
      return promise;
    },
  };
}
