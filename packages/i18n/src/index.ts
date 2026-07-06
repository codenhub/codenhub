import { createStore, type Store } from "@codenhub/store";

import { createDomTranslator } from "./dom-translation";
import { normalizeValue } from "./helpers";
import { createLocaleLoader, createEmptyDictionary } from "./locale-loader";
import { getInitialLocale, normalizeLocale, resolveLocaleState } from "./locale-resolution";
import type {
  I18n,
  I18nConfig,
  I18nInitOptions,
  I18nLocaleChangeEventDetail,
  I18nReadyEventDetail,
  LocaleDictionary,
  PersistedLocaleState,
} from "./types";

const DEFAULT_STORAGE_KEY = "i18n";

// Let activeI18n hold any I18n instance.
let activeI18n: I18n<string> | null = null;

export type {
  I18n,
  I18nConfig,
  I18nInitOptions,
  I18nLocaleChangeEventDetail,
  I18nReadyEventDetail,
  LocaleDictionary,
  LocaleDirection,
} from "./types";

const isPersistedLocaleState = <TLocale extends string>(
  config: I18nConfig<TLocale>,
  raw: unknown,
): raw is PersistedLocaleState => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return false;
  }

  const locale = (raw as Record<string, unknown>).locale;

  return locale === undefined || (typeof locale === "string" && config.isLocale(locale));
};

/**
 * Creates a browser-compatible translation manager instance using a factory pattern.
 * Uses localStorage for persistent locale preference, resolves user locales
 * automatically, and synchronizes document attributes and translated DOM elements.
 *
 * @typeParam TLocale - Union of supported locale string literals.
 * @param config - The translation configuration.
 * @returns An initialized translation manager interface.
 */
export function createI18n<TLocale extends string = string>(config: I18nConfig<TLocale>): I18n<TLocale> {
  let currentLocale: TLocale = config.defaultLocale;
  let isReadyState = false;
  let storageKey = DEFAULT_STORAGE_KEY;
  let root: ParentNode | null = null;
  let storage: Store<PersistedLocaleState> | null = null;
  let currentDictionary: LocaleDictionary = createEmptyDictionary();
  let isCurrentLocaleLoaded = false;
  const warnedMissingKeys = new Set<string>();
  let localeRequestId = 0;

  const localeLoader = createLocaleLoader(config);
  const domTranslator = createDomTranslator();
  const eventTarget = new EventTarget();

  const getDocumentRoot = (): ParentNode | null => {
    if (typeof document === "undefined") {
      return null;
    }
    return document;
  };

  const syncDocumentLocale = (): void => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.lang = currentLocale;
    document.documentElement.dir = config.getLocaleDirection(currentLocale);
  };

  const createLocaleRequest = (): number => {
    localeRequestId += 1;
    return localeRequestId;
  };

  const isLatestLocaleRequest = (requestId: number): boolean => {
    return requestId === localeRequestId;
  };

  const hasTranslations = (): boolean => {
    return Object.keys(currentDictionary).length > 0;
  };

  const warnMissingKey = (key: string, message: string): void => {
    const warningKey = `${currentLocale}::${key}`;

    if (warnedMissingKeys.has(warningKey)) {
      return;
    }

    warnedMissingKeys.add(warningKey);
    console.warn(message);
  };

  const translate = (key: string): string | undefined => {
    if (!isReadyState) {
      console.warn("[I18n] translate() was called before init() completed. Call init() first.");
      return undefined;
    }

    const normalizedKey = normalizeValue(key);

    if (normalizedKey === undefined) {
      return undefined;
    }

    const translation = currentDictionary[normalizedKey];

    if (translation !== undefined) {
      return translation;
    }

    warnMissingKey(normalizedKey, `[I18n] Missing key "${normalizedKey}" in locale "${currentLocale}".`);
    return undefined;
  };

  const translateDocument = (): void => {
    domTranslator.translateDocument(root, (key) => translate(key));
  };

  const i18nInstance: I18n<TLocale> = {
    get locale() {
      return currentLocale;
    },

    get isReady() {
      return isReadyState;
    },

    async init(options: I18nInitOptions = {}): Promise<void> {
      isReadyState = false;
      storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
      root = options.root ?? getDocumentRoot();
      storage = createStore<PersistedLocaleState>({
        storageKey,
        initialState: {},
        validate: (raw): raw is PersistedLocaleState => isPersistedLocaleState(config, raw),
      });
      localeLoader.resetFailedCache();
      warnedMissingKeys.clear();

      const requestId = createLocaleRequest();
      const initialLocale = getInitialLocale(config, storage.getItem("locale"));
      const localeState = await resolveLocaleState({
        config,
        loader: localeLoader,
        requestedLocale: initialLocale,
      });

      if (!isLatestLocaleRequest(requestId)) {
        return;
      }

      currentLocale = localeState.locale;
      currentDictionary = localeState.dictionary;
      isCurrentLocaleLoaded = localeState.isAppliedLocaleLoaded;

      if (localeState.isRequestedLocaleLoaded) {
        storage.set({ locale: localeState.locale });
      }

      isReadyState = true;
      syncDocumentLocale();
      translateDocument();
      eventTarget.dispatchEvent(
        new CustomEvent<I18nReadyEventDetail>("ready", {
          detail: {
            locale: currentLocale,
            hasTranslationsAvailable: hasTranslations(),
          },
        }),
      );
    },

    async setLocale(locale: string): Promise<boolean> {
      if (!isReadyState) {
        console.warn("[I18n] setLocale() was called before init() completed. Call init() first.");
        return false;
      }

      const nextLocale = normalizeLocale(config, locale);

      if (nextLocale === undefined) {
        return false;
      }

      const requestId = createLocaleRequest();

      if (nextLocale === currentLocale && isCurrentLocaleLoaded) {
        return true;
      }

      localeLoader.retryLocale(nextLocale);

      const localeState = await resolveLocaleState({
        config,
        loader: localeLoader,
        requestedLocale: nextLocale,
      });

      if (!isLatestLocaleRequest(requestId)) {
        return false;
      }

      const previousLocale = currentLocale;
      const previousDictionary = currentDictionary;
      currentLocale = localeState.locale;
      currentDictionary = localeState.dictionary;
      isCurrentLocaleLoaded = localeState.isAppliedLocaleLoaded;

      if (localeState.isRequestedLocaleLoaded) {
        storage?.set({ locale: localeState.locale });
      }

      const hasDocumentChanged = localeState.locale !== previousLocale || localeState.dictionary !== previousDictionary;

      if (hasDocumentChanged) {
        syncDocumentLocale();
        translateDocument();
      }

      if (localeState.locale !== previousLocale) {
        eventTarget.dispatchEvent(
          new CustomEvent<I18nLocaleChangeEventDetail>("locale-change", {
            detail: {
              locale: localeState.locale,
              previousLocale,
            },
          }),
        );
      }

      return localeState.isRequestedLocaleLoaded;
    },

    translate,

    addEventListener(type, callback, options) {
      eventTarget.addEventListener(type, callback, options);
    },

    removeEventListener(type, callback, options) {
      eventTarget.removeEventListener(type, callback, options);
    },

    dispatchEvent(event) {
      return eventTarget.dispatchEvent(event);
    },
  };

  return i18nInstance;
}

/**
 * Registers the global translation manager instance.
 *
 * @param i18n - The translation manager instance, or null to clear.
 */
export const setI18nInstance = (i18n: I18n<string> | null): void => {
  activeI18n = i18n;
};

/**
 * Retrieves the global translation manager instance.
 * Throws if no instance has been registered.
 *
 * @returns The active translation manager instance.
 * @throws {Error} If no active instance is configured.
 */
export const getI18nInstance = (): I18n<string> => {
  if (activeI18n === null) {
    throw new Error("[I18n] No i18n instance has been configured.");
  }

  return activeI18n;
};
