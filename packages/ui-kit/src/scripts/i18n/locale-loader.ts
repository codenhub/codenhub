/* oxlint-disable no-await-in-loop */
import type { I18nConfig, LocaleDictionary } from "./types";

const MAX_LOCALE_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 10_000;

export const createEmptyDictionary = (): LocaleDictionary => Object.create(null) as LocaleDictionary;

const isLocaleDictionary = (raw: unknown): raw is LocaleDictionary => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return false;
  }

  return Object.values(raw as Record<string, unknown>).every((value) => typeof value === "string");
};

const isRetryableStatus = (status: number): boolean => status === 408 || status === 429 || status >= 500;

export class LocaleLoader<TLocale extends string = string> {
  private localeCache: Partial<Record<TLocale, LocaleDictionary>> = Object.create(null) as Partial<
    Record<TLocale, LocaleDictionary>
  >;
  private localeFetchCache: Partial<Record<TLocale, Promise<LocaleDictionary | undefined>>> = Object.create(
    null,
  ) as Partial<Record<TLocale, Promise<LocaleDictionary | undefined>>>;
  private localeFailedCache = new Set<TLocale>();

  constructor(private readonly config: I18nConfig<TLocale>) {}

  resetFailedCache(): void {
    this.localeFailedCache = new Set<TLocale>();
  }

  retryLocale(locale: TLocale): void {
    this.localeFailedCache.delete(locale);
  }

  loadLocale(locale: TLocale): Promise<LocaleDictionary | undefined> {
    const cachedDictionary = this.localeCache[locale];

    if (cachedDictionary !== undefined) {
      return Promise.resolve(cachedDictionary);
    }

    if (this.localeFailedCache.has(locale)) {
      return Promise.resolve(undefined);
    }

    const inflight = this.localeFetchCache[locale];

    if (inflight !== undefined) {
      return inflight;
    }

    const promise = this.fetchAndCacheLocale(locale);
    this.localeFetchCache[locale] = promise;
    return promise;
  }

  private async fetchAndCacheLocale(locale: TLocale): Promise<LocaleDictionary | undefined> {
    const localeFile = this.config.getLocaleFile(locale);

    try {
      for (let attempt = 0; attempt <= MAX_LOCALE_RETRIES; attempt++) {
        const isLastAttempt = attempt === MAX_LOCALE_RETRIES;

        try {
          const result = await this.fetchLocaleFile(localeFile);

          if (!result.ok) {
            const isPermanentFailure = !isRetryableStatus(result.status);

            if (!isLastAttempt && !isPermanentFailure) {
              await this.delayBeforeRetry(attempt);
              continue;
            }

            console.warn(`[I18n] Failed to load locale "${locale}" from "${localeFile}".`);

            if (isPermanentFailure) {
              this.localeFailedCache.add(locale);
            }

            return undefined;
          }

          if (!isLocaleDictionary(result.body)) {
            console.warn(`[I18n] Locale "${locale}" has an invalid dictionary shape.`);
            this.localeFailedCache.add(locale);
            return undefined;
          }

          const dictionary = Object.assign(createEmptyDictionary(), result.body);

          if (Object.keys(dictionary).length === 0) {
            console.warn(`[I18n] Locale "${locale}" loaded successfully but contains no translations.`);
            return dictionary;
          }

          this.localeCache[locale] = dictionary;
          return dictionary;
        } catch (error) {
          if (error instanceof SyntaxError) {
            console.warn(`[I18n] Locale "${locale}" returned malformed JSON.`);
            this.localeFailedCache.add(locale);
            return undefined;
          }

          if (!isLastAttempt) {
            await this.delayBeforeRetry(attempt);
            continue;
          }

          console.warn(`[I18n] Failed to fetch locale "${locale}":`, error);
          return undefined;
        }
      }
    } finally {
      delete this.localeFetchCache[locale];
    }

    return undefined;
  }

  private async fetchLocaleFile(
    localeFile: string,
  ): Promise<{ ok: false; status: number } | { ok: true; body: unknown }> {
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
  }

  private delayBeforeRetry(attempt: number): Promise<void> {
    const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;

    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
