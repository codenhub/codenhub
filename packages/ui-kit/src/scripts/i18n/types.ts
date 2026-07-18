/** Writing direction applied to the document root for an active locale. */
export type LocaleDirection = "ltr" | "rtl";

/** Defines supported locales and resolves their files and writing directions. */
export interface I18nConfig<TLocale extends string = string> {
  /** Locale used when no persisted or browser preference can be applied. */
  defaultLocale: TLocale;
  /** Locales considered during browser-language matching. */
  locales: readonly TLocale[];
  /** Returns the Fetch-compatible URL for a locale dictionary. */
  getLocaleFile(locale: TLocale): string;
  /** Returns the document writing direction for a locale. */
  getLocaleDirection(locale: TLocale): LocaleDirection;
  /** Validates persisted and caller-provided strings as configured locale values. */
  isLocale(value: string): value is TLocale;
}

/** Flat translation dictionary loaded from a locale JSON file. */
export interface LocaleDictionary {
  /** Translation text indexed by its normalized key. */
  [key: string]: string;
}

/** Controls persistence and automatic DOM translation during initialization. */
export interface I18nInitOptions {
  /** Local-storage key for locale preference; defaults to `i18n`. */
  storageKey?: string;
  /** DOM subtree translated automatically; defaults to the document when available. */
  root?: ParentNode;
}

/** Detail emitted with the `ready` event after the latest initialization completes. */
export interface I18nReadyEventDetail {
  /** Locale applied after loading and fallback resolution. */
  locale: string;
  /** Whether the applied dictionary contains at least one translation. */
  translationsAvailable: boolean;
}

/** Detail emitted with `locale-change` after a requested locale loads and changes the active locale. */
export interface I18nLocaleChangeEventDetail {
  /** Newly applied locale. */
  locale: string;
  /** Locale active before the successful change. */
  previousLocale: string;
}

export interface PersistedLocaleState {
  locale?: string;
}

export interface ResolvedLocaleState<TLocale extends string = string> {
  locale: TLocale;
  dictionary: LocaleDictionary;
  isRequestedLocaleLoaded: boolean;
  isAppliedLocaleLoaded: boolean;
}
