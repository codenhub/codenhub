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
  I18nEventMap,
} from "./types";

const isPersistedLocaleState = <TLocale extends string>(
  config: I18nConfig<TLocale>,
  raw: unknown,
): raw is PersistedLocaleState => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return false;
  }

  const locale = (raw as Record<string, unknown>).locale;
  const isLocale =
    config.isLocale ?? ((val: string): val is TLocale => (config.locales as readonly string[]).includes(val));

  return locale === undefined || (typeof locale === "string" && isLocale(locale));
};

class I18nInstance<TLocale extends string = string> extends EventTarget implements I18n<TLocale> {
  private currentLocale: TLocale;
  private isReadyState = false;
  private storageKey = DEFAULT_STORAGE_KEY;
  private root: ParentNode | null = null;
  private storage: Store<PersistedLocaleState> | null = null;
  private currentDictionary: LocaleDictionary = createEmptyDictionary();
  private isCurrentLocaleLoaded = false;
  private readonly warnedMissingKeys = new Set<string>();
  private localeRequestId = 0;
  private isSilent: boolean;

  private readonly config: I18nConfig<TLocale>;
  private readonly localeLoader: ReturnType<typeof createLocaleLoader<TLocale>>;
  private readonly domTranslator = createDomTranslator();

  constructor(config: I18nConfig<TLocale>) {
    super();
    this.config = config;
    this.currentLocale = config.defaultLocale;
    this.isSilent = config.isSilent ?? false;
    this.localeLoader = createLocaleLoader(config);
  }

  get locale() {
    return this.currentLocale;
  }

  get isReady() {
    return this.isReadyState;
  }

  private getDocumentRoot(): ParentNode | null {
    if (typeof document === "undefined") {
      return null;
    }
    return document;
  }

  private syncDocumentLocale(): void {
    if (typeof document === "undefined" || !document.documentElement) {
      return;
    }
    document.documentElement.lang = this.currentLocale;
    document.documentElement.dir = this.config.getLocaleDirection(this.currentLocale);
  }

  private createLocaleRequest(): number {
    this.localeRequestId += 1;
    return this.localeRequestId;
  }

  private isLatestLocaleRequest(requestId: number): boolean {
    return requestId === this.localeRequestId;
  }

  private hasTranslations(): boolean {
    return Object.keys(this.currentDictionary).length > 0;
  }

  private warnMissingKey(key: string, message: string): void {
    if (this.isSilent) {
      return;
    }
    const warningKey = `${this.currentLocale}::${key}`;

    if (this.warnedMissingKeys.has(warningKey)) {
      return;
    }

    this.warnedMissingKeys.add(warningKey);
    console.warn(message);
  }

  translate = (key: string): string | undefined => {
    if (!this.isReadyState) {
      if (!this.isSilent) {
        console.warn("[I18n] translate() was called before init() completed. Call init() first.");
      }
      return undefined;
    }

    const normalizedKey = normalizeValue(key);

    if (normalizedKey === undefined) {
      return undefined;
    }

    const translation = this.currentDictionary[normalizedKey];

    if (translation !== undefined) {
      return translation;
    }

    this.warnMissingKey(normalizedKey, `[I18n] Missing key "${normalizedKey}" in locale "${this.currentLocale}".`);
    return undefined;
  };

  private translateDocument(): void {
    this.domTranslator.translateDocument(this.root, (key) => this.translate(key));
  }

  async init(options: I18nInitOptions = {}): Promise<void> {
    this.isReadyState = false;
    this.isSilent = options.isSilent ?? this.config.isSilent ?? false;
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.root = options.root ?? this.getDocumentRoot();
    this.storage = createStore<PersistedLocaleState>({
      storageKey: this.storageKey,
      initialState: {},
      validate: (raw): raw is PersistedLocaleState => isPersistedLocaleState(this.config, raw),
    });
    this.localeLoader.resetFailedCache();
    this.warnedMissingKeys.clear();

    const requestId = this.createLocaleRequest();
    const initialLocale = getInitialLocale(this.config, this.storage.getItem("locale"));
    const localeState = await resolveLocaleState({
      config: this.config,
      loader: this.localeLoader,
      requestedLocale: initialLocale,
    });

    if (!this.isLatestLocaleRequest(requestId)) {
      return;
    }

    this.currentLocale = localeState.locale;
    this.currentDictionary = localeState.dictionary;
    this.isCurrentLocaleLoaded = localeState.isAppliedLocaleLoaded;

    if (localeState.isRequestedLocaleLoaded) {
      this.storage.set({ locale: localeState.locale });
    }

    this.isReadyState = true;
    this.syncDocumentLocale();
    this.translateDocument();
    this.dispatchEvent(
      new CustomEvent<I18nReadyEventDetail>("ready", {
        detail: {
          locale: this.currentLocale,
          hasTranslationsAvailable: this.hasTranslations(),
        },
      }),
    );
  }

  async setLocale(locale: string): Promise<boolean> {
    if (!this.isReadyState) {
      if (!this.isSilent) {
        console.warn("[I18n] setLocale() was called before init() completed. Call init() first.");
      }
      return false;
    }

    const nextLocale = normalizeLocale(this.config, locale);

    if (nextLocale === undefined) {
      return false;
    }

    const requestId = this.createLocaleRequest();

    if (nextLocale === this.currentLocale && this.isCurrentLocaleLoaded) {
      return true;
    }

    this.localeLoader.retryLocale(nextLocale);

    const localeState = await resolveLocaleState({
      config: this.config,
      loader: this.localeLoader,
      requestedLocale: nextLocale,
    });

    if (!this.isLatestLocaleRequest(requestId)) {
      return false;
    }

    const previousLocale = this.currentLocale;
    const previousDictionary = this.currentDictionary;
    this.currentLocale = localeState.locale;
    this.currentDictionary = localeState.dictionary;
    this.isCurrentLocaleLoaded = localeState.isAppliedLocaleLoaded;

    if (localeState.isRequestedLocaleLoaded) {
      this.storage?.set({ locale: localeState.locale });
    }

    const hasDocumentChanged = localeState.locale !== previousLocale || localeState.dictionary !== previousDictionary;

    if (hasDocumentChanged) {
      this.syncDocumentLocale();
      this.translateDocument();
    }

    if (localeState.locale !== previousLocale) {
      this.dispatchEvent(
        new CustomEvent<I18nLocaleChangeEventDetail>("locale-change", {
          detail: {
            locale: localeState.locale,
            previousLocale,
          },
        }),
      );
    }

    return localeState.isRequestedLocaleLoaded;
  }
}

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
  return new I18nInstance(config);
}

/**
 * Registers the global translation manager instance.
 * This instance will be shared and accessible globally via {@link getI18nInstance}.
 *
 * @param i18n - The translation manager instance, or null to clear the global registration.
 *
 * @remarks
 * In multi-tenant server-side environments, do not use a global instance to prevent state leakage
 * between requests. Use request-scoped instances instead.
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
