import type { LocaleLoader } from "./locale-loader";

/** Text direction for a locale. */
export type LocaleDirection = "ltr" | "rtl";

/**
 * Configuration for the translation manager.
 *
 * @typeParam TLocale - Union of supported locale string literals.
 */
export interface I18nConfig<TLocale extends string = string> {
  /** The fallback locale when translations are missing or loading fails. */
  defaultLocale: TLocale;
  /** List of all supported locale codes. */
  locales: readonly TLocale[];
  /** Returns the path or URL where translation JSON files are located. */
  getLocaleFile(locale: TLocale): string;
  /** Returns the text direction (ltr or rtl) for the given locale. */
  getLocaleDirection(locale: TLocale): LocaleDirection;
  /** Type guard to verify if a string matches a supported locale. */
  isLocale(value: string): value is TLocale;
  /** Silences warnings about missing translation keys or pre-init calls. */
  silent?: boolean;
}

/** Record of translation key-value pairs. */
export interface LocaleDictionary {
  [key: string]: string;
}

/** Configuration options passed during translation manager initialization. */
export interface I18nInitOptions {
  /** Key used for persisting locale in localStorage. Defaults to "i18n". */
  storageKey?: string;
  /** DOM element or document subtree to watch and translate. Defaults to document. */
  root?: ParentNode;
  /** Silences warnings about missing translation keys or pre-init calls. */
  silent?: boolean;
}

/** Map of i18n event types to their respective CustomEvent details. */
export interface I18nEventMap {
  ready: CustomEvent<I18nReadyEventDetail>;
  "locale-change": CustomEvent<I18nLocaleChangeEventDetail>;
}

/** Detail payload for the "ready" event. */
export interface I18nReadyEventDetail {
  /** The active locale after initialization. */
  locale: string;
  /** Whether translations were successfully loaded and are available. */
  hasTranslationsAvailable: boolean;
}

/** Detail payload for the "locale-change" event. */
export interface I18nLocaleChangeEventDetail {
  /** The new active locale. */
  locale: string;
  /** The previously active locale. */
  previousLocale: string;
}

/** Persisted state stored in localStorage. */
export interface PersistedLocaleState {
  /** The persisted locale choice. */
  locale?: string;
}

/**
 * Internal state resolved during locale loading.
 *
 * @internal
 */
export interface ResolvedLocaleState<TLocale extends string = string> {
  locale: TLocale;
  dictionary: LocaleDictionary;
  isRequestedLocaleLoaded: boolean;
  isAppliedLocaleLoaded: boolean;
}

/**
 * The translation manager interface.
 * Exposes methods to initialize state, change locales, translate strings,
 * and listen to translation-related events.
 *
 * @typeParam TLocale - Union of supported locale string literals.
 */
export interface I18n<TLocale extends string = string> {
  /** The currently active locale. */
  readonly locale: TLocale;
  /** Whether the translation manager is initialized and ready. */
  readonly isReady: boolean;

  /**
   * Initializes the translation manager, loading the resolved locale
   * and translating matching DOM elements.
   *
   * @param options - Optional initialization configuration.
   * @returns A promise that resolves when initialization is complete.
   */
  init(options?: I18nInitOptions): Promise<void>;

  /**
   * Changes the active locale. Loads new translations if needed,
   * synchronizes document attributes, re-translates the DOM, and emits
   * a "locale-change" event on success.
   *
   * @param locale - The next locale code to switch to.
   * @returns A promise resolving to true if the change was successful, false otherwise.
   */
  setLocale(locale: string): Promise<boolean>;

  /** Translates a given translation key using the active locale's dictionary. */
  translate(key: string): string | undefined;

  /** Adds an event listener for translation events. */
  addEventListener<K extends keyof I18nEventMap>(
    type: K,
    callback: (this: I18n<TLocale>, ev: I18nEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void;

  /** Removes an event listener for translation events. */
  removeEventListener<K extends keyof I18nEventMap>(
    type: K,
    callback: (this: I18n<TLocale>, ev: I18nEventMap[K]) => void,
    options?: EventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void;

  /** Dispatches an event on the translation manager. */
  dispatchEvent(event: Event): boolean;
}

/**
 * Options for resolving the locale state.
 *
 * @internal
 */
export interface ResolveLocaleStateOptions<TLocale extends string = string> {
  /** The translation config. */
  config: I18nConfig<TLocale>;
  /** The locale loader manager. */
  loader: LocaleLoader<TLocale>;
  /** The locale code that was requested. */
  requestedLocale: TLocale;
}
