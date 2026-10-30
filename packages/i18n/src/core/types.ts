/** Text direction used when rendering a locale. */
export type LocaleDirection = "ltr" | "rtl";

/** Immutable flat translation keys and string values. */
export interface LocaleDictionary {
  readonly [key: string]: string;
}

/**
 * Resource limits checked when a loaded dictionary is validated. Each must be a positive safe integer.
 * The 1,000-character flattened-key limit is fixed, because `translate()` and DOM keys share it.
 */
export interface LocaleDictionaryLimits {
  /** Maximum nesting levels below the root object. Defaults to 100. */
  maxDepth?: number;
  /** Maximum string translations. Defaults to 10,000. */
  maxTranslations?: number;
  /** Maximum traversed properties, counting translations and nested groups. Defaults to 20,000. */
  maxProperties?: number;
  /** Maximum characters in one translation value. Defaults to 100,000. */
  maxValueLength?: number;
  /** Maximum characters across all translation values. Defaults to 5,000,000. */
  maxTotalLength?: number;
}

// Distributes over the property type so an optional leaf (`string | undefined`) still counts as a key. A group with an
// `other` form is a plural, so the group itself is a key as well as each of its forms.
type PropertyKeyPath<K extends string, TValue> = TValue extends string
  ? K
  : TValue extends undefined
    ? never
    : `${K}.${FlattenedKey<TValue>}` | (TValue extends { readonly other: string } ? K : never);

type FlattenedKey<TMessages> = TMessages extends string
  ? never
  : {
      [K in keyof TMessages & string]-?: PropertyKeyPath<K, TMessages[K]>;
    }[keyof TMessages & string];

/**
 * Dot-separated keys of a dictionary type's string leaves and of its plural groups, those with an `other` form, or any
 * string when the dictionary type is unknown.
 *
 * @example
 * ```ts
 * import type en from "./locales/en.json";
 *
 * type Key = TranslationKey<typeof en>; // such as "page.title"
 * const label = (key: Key) => t(key);
 * ```
 *
 * @typeParam TMessages - Dictionary type, such as an `as const` object or an imported JSON module type.
 */
export type TranslationKey<TMessages> = unknown extends TMessages ? string : FlattenedKey<TMessages>;

/**
 * Runtime-neutral dependencies and supported locale metadata.
 *
 * @typeParam TLocale - Union of supported canonical locale identifiers.
 * @typeParam TMessages - Dictionary type returned by `loadLocale`; its flattened leaf paths type translation keys.
 */
export interface I18nConfig<TLocale extends string = string, TMessages = unknown> {
  /**
   * Supported ASCII locale used initially and for missing-key fallback; matched after trimming, case-insensitively.
   * Locale types are inferred from `locales` only, so a `string` here is a compile error rather than a reason to
   * accept any string as a locale.
   */
  defaultLocale: NoInfer<TLocale>;
  /** Non-empty, case-insensitively unique ASCII locale identifiers composed of alphanumeric hyphen-separated subtags. */
  locales: readonly TLocale[];
  /**
   * Loads a flat or nested dictionary through a consumer-selected transport; callback failures become `I18nError`.
   * Its declared return type, such as an `as const` object or an imported JSON module, types translation keys;
   * an `unknown` or `any` return accepts any string key.
   */
  loadLocale(locale: TLocale): TMessages | Promise<TMessages>;
  /**
   * Resolves `ltr` or `rtl`; called during creation and state changes, with failures propagated unchanged.
   *
   * @defaultValue `rtl` for a right-to-left script subtag, such as `uz-Arab`, or, without a script subtag, a
   * right-to-left language, such as `ar`, `he`, `fa`, or `ur`; otherwise `ltr`.
   */
  getLocaleDirection?(locale: TLocale): LocaleDirection;
  /**
   * Called for every key missing from both the active and default dictionaries, in place of the default warning.
   * Exceptions propagate from the lookup, so a test can throw here to fail on a missing key.
   *
   * @defaultValue A `console.warn` once for each of the 1,000 most recent locale/key pairs, unless `isSilent`.
   */
  onMissingKey?(key: string, locale: TLocale): void;
  /** Suppresses optional diagnostics, including the default missing-key warning, without suppressing failures. Defaults to `false`. */
  isSilent?: boolean;
  /** Raises or lowers the resource limits applied to loaded dictionaries; unset limits keep their defaults. */
  dictionaryLimits?: LocaleDictionaryLimits;
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
 * @remarks
 * Every method is bound to its manager, so a destructured method, such as `const { t } = i18n`, keeps working.
 *
 * @typeParam TLocale - Union of supported canonical locale identifiers.
 * @typeParam TKey - Union of accepted translation keys. Defaults to `string`; `createI18n()` sets it to
 * `TranslationKey<TMessages>` for the loader's dictionary type.
 */
export interface I18n<TLocale extends string = string, TKey extends string = string> {
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
   * @returns A promise that resolves after loading completes. Applied initialization emits `ready`; a stale successful
   * request, superseded by a later `init()` or `setLocale()`, resolves without changing state or emitting an event.
   * Failure leaves active state unchanged.
   * @throws {RangeError} When the locale is unsupported.
   * @throws {TypeError} When a loaded dictionary is invalid.
   * @throws {TypeError} When direction resolution returns a value other than `ltr` or `rtl`.
   * @throws {I18nError} When an injected locale loader rejects.
   * Exceptions from the direction callback propagate unchanged.
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
   * @returns A promise that resolves after loading completes. Applied changes emit `locale-change`; same-locale and stale
   * successful requests resolve without changing state or emitting an event. Failure preserves active state.
   * @throws {Error} When called before successful initialization.
   * @throws {RangeError} When the locale is unsupported.
   * @throws {TypeError} When a loaded dictionary is invalid.
   * @throws {TypeError} When direction resolution returns a value other than `ltr` or `rtl`.
   * @throws {I18nError} When an injected locale loader rejects.
   * Exceptions from the direction callback propagate unchanged.
   */
  setLocale(locale: TLocale): Promise<void>;

  /**
   * Canonicalizes an exact configured locale match.
   *
   * @param value - Untrusted locale value.
   * @returns The canonical locale or undefined; language subtags are not matched, as {@link I18n.matchLocale} does.
   */
  resolveLocale(value: string): TLocale | undefined;

  /**
   * Picks the configured locale that best serves ordered preferences, such as `navigator.languages` or the tags of an
   * `Accept-Language` header sorted by quality.
   *
   * @remarks
   * Each preference, in order, tries an exact case-insensitive match, then the longest configured locale it starts with
   * as whole subtags and with the same likely script, such as `pt` for `pt-BR`, then likely subtags, such as `zh-Hant`
   * for `zh-TW`, then the same language subtag.
   *
   * @param preferences - Untrusted locale tags, most preferred first; blank, malformed, and non-string entries are skipped.
   * @returns The canonical locale for the first preference that matches, or undefined when none does.
   * @throws {TypeError} When `preferences` is not an array.
   */
  matchLocale(preferences: readonly string[]): TLocale | undefined;

  /**
   * Resolves a trimmed key against active and default dictionaries and fills its `{name}` placeholders.
   *
   * @remarks
   * When `params.count` is a number and the key is a group of plural forms rather than a text, such as
   * `{ one: "{count} item", other: "{count} items" }`, the form is chosen with `Intl.PluralRules` for the locale of the
   * dictionary that has the group, falling back to its `other` form. Forms are named by CLDR plural category: `zero`,
   * `one`, `two`, `few`, `many`, and `other`.
   *
   * @example
   * ```ts
   * t("cart.items", { count: 3 }); // "3 items"
   * ```
   *
   * @param key - Translation key, or the key of a plural group when `params.count` is a number.
   * @param params - Values for `{name}` placeholders, read from own properties. A placeholder without a value is left
   * as written; without `params`, the text is returned unchanged. A numeric `count` also selects a plural form.
   * @returns The translated text, or the trimmed key when neither dictionary has it. A miss calls `onMissingKey`, or
   * warns once per recent locale/key pair unless silent.
   * @throws {Error} When called before successful initialization.
   * @throws {TypeError} When the key is empty, not a string, longer than 1,000 characters, or contains ASCII controls.
   */
  translate(key: TKey, params?: Readonly<Record<string, string | number>>): string;

  /** Short alias of {@link I18n.translate}, the same bound function. */
  t(key: TKey, params?: Readonly<Record<string, string | number>>): string;

  /**
   * Calls a listener after every applied initialization and locale change, such as to re-render a framework.
   *
   * @param listener - Called without arguments; exceptions are reported as for any `EventTarget` listener.
   * @returns A function that removes the listener; calling it again does nothing.
   */
  subscribe(listener: () => void): () => void;

  /** Adds a typed lifecycle event listener. */
  addEventListener<K extends keyof I18nEventMap<TLocale>>(
    type: K,
    callback: (this: I18n<TLocale, TKey>, event: I18nEventMap<TLocale>[K]) => void,
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
    callback: (this: I18n<TLocale, TKey>, event: I18nEventMap<TLocale>[K]) => void,
    options?: EventListenerOptions | boolean,
  ): void;
  /** Removes a standard event listener registered through EventTarget. */
  removeEventListener(
    type: string,
    callback: EventListener | EventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void;
}
