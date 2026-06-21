import { createStore, type Store } from "@codenhub/store";

import { DomTranslator } from "./dom-translation";
import { normalizeValue } from "./helpers";
import { LocaleLoader, createEmptyDictionary } from "./locale-loader";
import { getInitialLocale, normalizeLocale, resolveLocaleState } from "./locale-resolution";
import type {
  I18nConfig,
  I18nInitOptions,
  I18nLocaleChangeEventDetail,
  I18nReadyEventDetail,
  LocaleDictionary,
  PersistedLocaleState,
} from "./types";

const DEFAULT_STORAGE_KEY = "i18n";

let activeI18n: I18n | null = null;

export type {
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
  if (typeof raw !== "object" || raw === null) {
    return false;
  }

  const locale = (raw as Record<string, unknown>).locale;

  return locale === undefined || (typeof locale === "string" && config.isLocale(locale));
};

export class I18n<TLocale extends string = string> extends EventTarget {
  private currentLocale: TLocale;
  private storageKey = DEFAULT_STORAGE_KEY;
  private root: ParentNode | null = null;
  private readyState = false;
  private storage: Store<PersistedLocaleState> | null = null;
  private currentDictionary: LocaleDictionary = createEmptyDictionary();
  private currentLocaleLoaded = false;
  private warnedMissingKeys = new Set<string>();
  private localeRequestId = 0;
  private readonly localeLoader: LocaleLoader<TLocale>;
  private readonly domTranslator = new DomTranslator();

  constructor(private readonly config: I18nConfig<TLocale>) {
    super();
    this.currentLocale = config.defaultLocale;
    this.localeLoader = new LocaleLoader(config);
  }

  get locale(): TLocale {
    return this.currentLocale;
  }

  get ready(): boolean {
    return this.readyState;
  }

  async init(options: I18nInitOptions = {}): Promise<void> {
    this.readyState = false;
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.root = options.root ?? this.getDocumentRoot();
    this.storage = createStore<PersistedLocaleState>({
      storageKey: this.storageKey,
      initialState: {},
      validate: (raw): raw is PersistedLocaleState => isPersistedLocaleState(this.config, raw),
    });
    this.localeLoader.resetFailedCache();
    this.warnedMissingKeys = new Set<string>();

    const requestId = this.createLocaleRequest();
    const initialLocale = getInitialLocale(this.config, this.storage.getItem("locale"));
    const localeState = await resolveLocaleState(this.config, this.localeLoader, initialLocale);

    if (!this.isLatestLocaleRequest(requestId)) {
      return;
    }

    this.currentLocale = localeState.locale;
    this.currentDictionary = localeState.dictionary;
    this.currentLocaleLoaded = localeState.isAppliedLocaleLoaded;

    if (localeState.isRequestedLocaleLoaded) {
      this.storage.set({ locale: localeState.locale });
    }

    this.readyState = true;
    this.syncDocumentLocale();
    this.translateDocument();
    this.dispatchEvent(
      new CustomEvent<I18nReadyEventDetail>("ready", {
        detail: {
          locale: this.currentLocale,
          translationsAvailable: this.hasTranslations(),
        },
      }),
    );
  }

  async setLocale(locale: string): Promise<boolean> {
    if (!this.readyState) {
      console.warn("[I18n] setLocale() was called before init() completed. Call init() first.");
      return false;
    }

    const nextLocale = normalizeLocale(this.config, locale);

    if (nextLocale === undefined) {
      return false;
    }

    const requestId = this.createLocaleRequest();

    if (nextLocale === this.currentLocale && this.currentLocaleLoaded) {
      return true;
    }

    this.localeLoader.retryLocale(nextLocale);

    const localeState = await resolveLocaleState(this.config, this.localeLoader, nextLocale);

    if (!this.isLatestLocaleRequest(requestId)) {
      return false;
    }

    const previousLocale = this.currentLocale;
    const previousDictionary = this.currentDictionary;
    this.currentLocale = localeState.locale;
    this.currentDictionary = localeState.dictionary;
    this.currentLocaleLoaded = localeState.isAppliedLocaleLoaded;

    if (localeState.isRequestedLocaleLoaded) {
      this.storage?.set({ locale: localeState.locale });
    }

    const documentChanged = localeState.locale !== previousLocale || localeState.dictionary !== previousDictionary;

    if (documentChanged) {
      this.syncDocumentLocale();
      this.translateDocument();
    }

    if (localeState.isRequestedLocaleLoaded && localeState.locale !== previousLocale) {
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

  translate(key: string): string | undefined {
    if (!this.readyState) {
      console.warn("[I18n] translate() was called before init() completed. Call init() first.");
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
  }

  private warnMissingKey(key: string, message: string): void {
    const warningKey = `${this.currentLocale}::${key}`;

    if (this.warnedMissingKeys.has(warningKey)) {
      return;
    }

    this.warnedMissingKeys.add(warningKey);
    console.warn(message);
  }

  private translateDocument(): void {
    this.domTranslator.translateDocument(this.root, (key) => this.translate(key));
  }

  private hasTranslations(): boolean {
    return Object.keys(this.currentDictionary).length > 0;
  }

  private createLocaleRequest(): number {
    this.localeRequestId += 1;
    return this.localeRequestId;
  }

  private isLatestLocaleRequest(requestId: number): boolean {
    return requestId === this.localeRequestId;
  }

  private syncDocumentLocale(): void {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.lang = this.currentLocale;
    document.documentElement.dir = this.config.getLocaleDirection(this.currentLocale);
  }

  private getDocumentRoot(): ParentNode | null {
    if (typeof document === "undefined") {
      return null;
    }

    return document;
  }
}

export const setI18nInstance = (i18n: I18n | null): void => {
  activeI18n = i18n;
};

export const getI18nInstance = (): I18n => {
  if (activeI18n === null) {
    throw new Error("[I18n] No i18n instance has been configured.");
  }

  return activeI18n;
};
