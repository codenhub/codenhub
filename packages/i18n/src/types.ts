import type { LocaleLoader } from "./locale-loader";

/**
 * Text direction for a locale.
 * - "ltr": Left-to-right (default for most languages).
 * - "rtl": Right-to-left (used for Arabic, Hebrew, etc.).
 */
export type LocaleDirection = "ltr" | "rtl";

/**
 * Configuration structure for the translation manager.
 *
 * @typeParam TLocale - Union of supported locale string literals.
 */
export interface I18nConfig<TLocale extends string = string> {
  /** The fallback locale when translations are missing or loading fails. */
  defaultLocale: TLocale;
  /** List of all supported locale codes. */
  locales: readonly TLocale[];
  /**
   * Returns the path or URL where translation JSON files are located.
   *
   * @param locale - The locale code to retrieve the file path for.
   * @returns The resolved path or URL string.
   */
  getLocaleFile(locale: TLocale): string;
  /**
   * Returns the text direction (ltr or rtl) for the given locale.
   *
   * @param locale - The locale code to retrieve the direction for.
   * @returns The text direction type.
   */
  getLocaleDirection(locale: TLocale): LocaleDirection;
  /**
   * Type guard to verify if a string matches a supported locale.
   *
   * @param value - The raw string value to validate.
   * @returns True if value is a supported locale code, false otherwise.
   */
  isLocale?(value: string): value is TLocale;
  /**
   * Silences warnings about missing translation keys or pre-init calls.
   * Useful in production environments.
   */
  isSilent?: boolean;
}

/** Record of translation key-value pairs. */
export interface LocaleDictionary {
  [key: string]: string;
}

/** Configuration options passed during translation manager initialization. */
export interface I18nInitOptions {
  /**
   * Key used for persisting locale choice in localStorage.
   * @defaultValue "i18n"
   */
  storageKey?: string;
  /**
   * DOM element or document subtree to watch and translate.
   * @defaultValue document
   */
  root?: ParentNode;
  /**
   * Silences warnings about missing translation keys or pre-init calls.
   * Overrides config-level silent option if provided.
   */
  isSilent?: boolean;
}

/** Map of i18n event types to their respective CustomEvent details. */
export interface I18nEventMap {
  /** Emitted when the i18n manager completes initialization. */
  ready: CustomEvent<I18nReadyEventDetail>;
  /** Emitted when the active locale changes successfully. */
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
   *
   * @remarks
   * If run in a server-side rendering environment (where `window`/`document` is undefined),
   * the promise resolves immediately without fetching or throwing.
   * If loading the initial locale fails, it will attempt to load the default locale.
   * If both fail, it completes initialization but marks translations as unavailable.
   */
  init(options?: I18nInitOptions): Promise<void>;

  /**
   * Changes the active locale. Loads new translations if needed,
   * synchronizes document attributes (`lang` and `dir`), re-translates the DOM,
   * and emits a "locale-change" event on success.
   *
   * @param locale - The next locale code to switch to.
   * @returns A promise resolving to true if the change was successful (requested locale loaded),
   *          false otherwise (e.g. invalid locale, network error falling back to default).
   *
   * @remarks
   * If the next locale is invalid, returns false immediately.
   * If the requested locale fails to load, it falls back to the default locale. If default locale also fails,
   * it retains the previously active locale.
   */
  setLocale(locale: string): Promise<boolean>;

  /**
   * Translates a given translation key using the active locale's dictionary.
   * Supports dot-notation keys for nested JSON structures.
   *
   * @param key - The translation key to resolve.
   * @returns The resolved translation string, or undefined if the key is missing.
   *
   * @remarks
   * If called before `init()` completes, returns undefined and warns (unless silent).
   * If key is missing from the dictionary, returns undefined and warns once per key (unless silent).
   */
  translate(key: string): string | undefined;

  /**
   * Adds an event listener for translation events.
   *
   * @param type - The event name ("ready" or "locale-change").
   * @param callback - Event listener callback.
   * @param options - Event listener options.
   */
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

  /**
   * Removes an event listener for translation events.
   *
   * @param type - The event name.
   * @param callback - Event listener callback to remove.
   * @param options - Event listener options.
   */
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

  /**
   * Dispatches an event on the translation manager.
   *
   * @param event - The event to dispatch.
   * @returns True if either event's cancelable attribute value is false or its preventDefault()
   *          method was not invoked, false otherwise.
   */
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
