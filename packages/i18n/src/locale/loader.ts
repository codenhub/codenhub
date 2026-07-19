import { I18nError } from "../core/errors";
import type { LocaleDictionary } from "../core/types";
import { normalizeDictionary } from "./dictionary";

/** Injected runtime-specific locale payload loader. */
export interface LocaleLoaderOptions<TLocale extends string> {
  /** Returns a flat or nested locale payload. */
  loadLocale(locale: TLocale): unknown | Promise<unknown>;
}

/** Cache and normalization boundary used by an i18n manager. */
export interface LocaleLoader<TLocale extends string> {
  /** Loads one locale without changing active manager state. */
  loadLocale(locale: TLocale): Promise<LocaleDictionary>;
}

/**
 * Creates a per-manager loader with successful and in-flight caching.
 *
 * @param options - Injected locale payload callback.
 * @returns A loader that validates and freezes successful payloads.
 * @internal
 */
export function createLocaleLoader<TLocale extends string>(
  options: LocaleLoaderOptions<TLocale>,
): LocaleLoader<TLocale> {
  const dictionaries = new Map<TLocale, LocaleDictionary>();
  const pendingLoads = new Map<TLocale, Promise<LocaleDictionary>>();

  return {
    loadLocale(locale) {
      const dictionary = dictionaries.get(locale);

      if (dictionary !== undefined) {
        return Promise.resolve(dictionary);
      }

      const pendingLoad = pendingLoads.get(locale);

      if (pendingLoad !== undefined) {
        return pendingLoad;
      }

      const load = async (): Promise<LocaleDictionary> => {
        let payload: unknown;

        try {
          payload = await options.loadLocale(locale);
        } catch (cause) {
          throw new I18nError({ locale, cause });
        }

        const normalizedDictionary = normalizeDictionary(payload);
        dictionaries.set(locale, normalizedDictionary);
        return normalizedDictionary;
      };

      const loadAndClear = async (): Promise<LocaleDictionary> => {
        try {
          return await load();
        } finally {
          pendingLoads.delete(locale);
        }
      };

      const nextLoad = loadAndClear();
      pendingLoads.set(locale, nextLoad);
      return nextLoad;
    },
  };
}
