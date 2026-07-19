/** Text direction used when rendering a locale. */
export type LocaleDirection = "ltr" | "rtl";

/** Immutable flat translation keys and string values. */
export interface LocaleDictionary {
  readonly [key: string]: string;
}

/**
 * Runtime-neutral dependencies and supported locale metadata.
 *
 * @typeParam TLocale - Union of supported canonical locale identifiers.
 */
export interface I18nConfig<TLocale extends string = string> {
  /** Locale used initially and for missing-key fallback. */
  defaultLocale: TLocale;
  /** Supported canonical locale identifiers. */
  locales: readonly TLocale[];
  /** Loads a flat or nested dictionary through a consumer-selected transport. */
  loadLocale(locale: TLocale): unknown | Promise<unknown>;
  /** Resolves the rendering direction for an active locale. */
  getLocaleDirection(locale: TLocale): LocaleDirection;
  /** Suppresses optional missing-key diagnostics without suppressing failures. */
  isSilent?: boolean;
}

/** Locale selected explicitly during initialization. */
export interface I18nInitOptions<TLocale extends string = string> {
  /** Locale to activate; defaults to the configured default locale. */
  locale?: TLocale;
}

/** Payload emitted after successful initialization is applied. */
export interface I18nReadyEventDetail<TLocale extends string = string> {
  /** Active canonical locale. */
  locale: TLocale;
}

/** Payload emitted after a successful active locale change. */
export interface I18nLocaleChangeEventDetail<TLocale extends string = string> {
  /** Newly active canonical locale. */
  locale: TLocale;
  /** Locale active before the change. */
  previousLocale: TLocale;
}

/** Typed lifecycle events dispatched by an i18n manager. */
export interface I18nEventMap<TLocale extends string = string> {
  /** Successful initialization event. */
  ready: CustomEvent<I18nReadyEventDetail<TLocale>>;
  /** Successful active locale change event. */
  "locale-change": CustomEvent<I18nLocaleChangeEventDetail<TLocale>>;
}

/**
 * Consumer-owned runtime-neutral translation manager.
 *
 * @typeParam TLocale - Union of supported canonical locale identifiers.
 */
export interface I18n<TLocale extends string = string> {
  /** Canonical fallback locale. */
  readonly defaultLocale: TLocale;
  /** Frozen copy of supported canonical locales. */
  readonly locales: readonly TLocale[];
  /** Whether optional diagnostics are suppressed. */
  readonly isSilent: boolean;
  /** Currently active canonical locale. */
  readonly locale: TLocale;
  /** Rendering direction of the active locale. */
  readonly direction: LocaleDirection;
  /** Whether required dictionaries have been loaded and state applied. */
  readonly isReady: boolean;

  /**
   * Atomically loads and activates an explicit locale or the default locale.
   *
   * @param options - Optional explicit locale selection.
   * @throws {RangeError} When the locale is unsupported.
   * @throws {TypeError} When a loaded dictionary is invalid.
   * @throws {I18nError} When an injected locale loader rejects.
   */
  init(options?: I18nInitOptions<TLocale>): Promise<void>;

  /**
   * Loads and caches an immutable dictionary without changing active state.
   *
   * @param locale - Supported locale to load.
   * @returns The normalized dictionary.
   * @throws {RangeError} When the locale is unsupported.
   * @throws {TypeError} When the loaded dictionary is invalid.
   * @throws {I18nError} When the injected locale loader rejects.
   */
  loadLocale(locale: TLocale): Promise<LocaleDictionary>;

  /**
   * Atomically changes the active locale after all required loads succeed.
   *
   * @param locale - Supported locale to activate.
   * @throws {Error} When called before successful initialization.
   * @throws {RangeError} When the locale is unsupported.
   * @throws {TypeError} When a loaded dictionary is invalid.
   * @throws {I18nError} When an injected locale loader rejects.
   */
  setLocale(locale: TLocale): Promise<void>;

  /**
   * Canonicalizes an exact configured locale match.
   *
   * @param value - Untrusted locale value.
   * @returns The canonical locale or undefined; language subtags are not matched.
   */
  resolveLocale(value: string): TLocale | undefined;

  /**
   * Resolves a trimmed key against active and default dictionaries.
   *
   * @param key - Translation key.
   * @returns The translated string or undefined when absent.
   * @throws {Error} When called before successful initialization.
   * @throws {TypeError} When the key is empty or not a string.
   */
  translate(key: string): string | undefined;

  /** Adds a typed lifecycle event listener. */
  addEventListener<K extends keyof I18nEventMap<TLocale>>(
    type: K,
    callback: (this: I18n<TLocale>, event: I18nEventMap<TLocale>[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  /** Adds a standard event listener for interoperability with EventTarget. */
  addEventListener(
    type: string,
    callback: EventListener | EventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void;

  /** Removes a typed lifecycle event listener. */
  removeEventListener<K extends keyof I18nEventMap<TLocale>>(
    type: K,
    callback: (this: I18n<TLocale>, event: I18nEventMap<TLocale>[K]) => void,
    options?: EventListenerOptions | boolean,
  ): void;
  /** Removes a standard event listener registered through EventTarget. */
  removeEventListener(
    type: string,
    callback: EventListener | EventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void;
}
