import type { TranslateParams } from "./message-params";

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
  /**
   * Maximum nesting levels below the root object. Defaults to 100. Each level adds at least 2 characters to a
   * flattened key, a name and a dot, so with the 1,000-character key limit, a translation more than 499 levels deep
   * can't be loaded whatever this is set to.
   */
  maxDepth?: number | undefined;
  /** Maximum string translations. Defaults to 10,000. */
  maxTranslations?: number | undefined;
  /** Maximum traversed properties, counting translations and nested groups. Defaults to 20,000. */
  maxProperties?: number | undefined;
  /** Maximum characters in one translation value. Defaults to 100,000. */
  maxValueLength?: number | undefined;
  /** Maximum characters across all translation values. Defaults to 5,000,000. */
  maxTotalLength?: number | undefined;
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
  loadLocale(locale: NoInfer<TLocale>): TMessages | Promise<TMessages>;
  /**
   * Resolves `ltr` or `rtl`; called during creation and state changes, with failures propagated unchanged.
   *
   * @defaultValue `rtl` when the locale's script is right-to-left, otherwise `ltr`. The script is its script subtag,
   * such as `uz-Arab`, else the likely script `Intl.Locale` gives for its language and region, such as Arabic for
   * `pa-PK` and `arz` and Devanagari for `sd-IN`; for a tag `Intl.Locale` rejects, a right-to-left language, such as
   * `ar` or `he`, gives `rtl`.
   */
  getLocaleDirection?: ((locale: NoInfer<TLocale>) => LocaleDirection) | undefined;
  /**
   * Called for every key missing from every dictionary the active locale falls back to, in place of the default
   * warning.
   * Exceptions propagate from the lookup, so a test can throw here to fail on a missing key.
   *
   * @defaultValue A `console.warn` once for each of the 1,000 most recent locale/key pairs, unless `isSilent`.
   */
  onMissingKey?: ((key: string, locale: NoInfer<TLocale>) => void) | undefined;
  /** Suppresses optional diagnostics, including the default missing-key warning, without suppressing failures. Defaults to `false`. */
  isSilent?: boolean | undefined;
  /**
   * IANA time zone, such as `"America/Sao_Paulo"` or `"UTC"`, for `{d, date}`, `{d, time}`, and `{d}` in messages,
   * and the default of `formatDate`. Set it on a server, where the runtime's time zone is the server's, not the
   * reader's, so a date shows the same day as in the reader's browser. Checked at creation.
   *
   * @defaultValue The runtime's time zone.
   */
  timeZone?: string | undefined;
  /** Raises or lowers the resource limits applied to loaded dictionaries; unset limits keep their defaults. */
  dictionaryLimits?: LocaleDictionaryLimits | undefined;
}

/** Locale selected explicitly during initialization. */
export interface I18nInitOptions<TLocale extends string = string> {
  /** Locale to activate; defaults to the configured default locale. */
  locale?: TLocale | undefined;
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
 * @typeParam TMessages - Dictionary type returned by `loadLocale`. Defaults to `unknown`, which accepts any values;
 * `createI18n()` sets it, so a literal message, such as one in an `as const` dictionary, requires its arguments.
 */
export interface I18n<TLocale extends string = string, TKey extends string = string, TMessages = unknown> {
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
   * for `zh-TW`, then the same language in the same likely script. A locale in another script never matches, so with
   * `zh`, which is Simplified, `zh-TW` tries the next preference. A configured locale `Intl.Locale` rejects has no likely
   * script, so it matches by language, and by the script it names when it names one. When several configured locales share a preference's
   * language and script and none matches it exactly or by likely region, the first in `locales` wins: list `es-419`
   * before `es-ES` to serve `es-MX` from `es-419`. `es-ES`, and `es`, whose likely region is Spain, still match `es-ES`.
   *
   * @param preferences - Untrusted locale tags, most preferred first; blank, malformed, and non-string entries are skipped.
   * @returns The canonical locale for the first preference that matches, or undefined when none does.
   * @throws {TypeError} When `preferences` is not an array.
   */
  matchLocale(preferences: readonly string[]): TLocale | undefined;

  /**
   * Resolves a trimmed key against the active locale's dictionary, then each configured parent locale's, such as `pt`
   * for `pt-BR`, then the default locale's, and formats it as an ICU message.
   *
   * @remarks
   * A parent is made by dropping subtags and is skipped when its likely script differs, so `zh-Hant` never falls back to
   * `zh`, which is Simplified Chinese.
   *
   * Messages use ICU syntax: `{name}`, `{n, number}` with an optional `integer` or `percent` style, `{d, date}` and
   * `{d, time}` with an optional `short`, `medium` (the default), `long`, or `full` style, `{n, plural, …}` and
   * `{n, selectordinal, …}` with `=N` and CLDR category options, an optional `offset:N`, and `#` for the number in the
   * plural's own forms, and `{v, select, …}`. Plural categories and every format use the locale of the dictionary that has the text. An
   * apostrophe before `{`, `}`, or, in a plural, `#` quotes them, and `''` is one apostrophe. A message that is not
   * valid syntax warns once, unless silent, and only its `{name}` placeholders are filled.
   *
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
   * @param params - Argument values, read from own properties. An argument without a usable value, such as a string
   * for `{n, number}`, is left as written. A string or number in `{name}` is inserted as JavaScript writes it, and a
   * date as `{name, date}` would format it. A numeric `count` also selects a plural form.
   * @returns The translated text, or the trimmed key when no dictionary has it. A miss calls `onMissingKey`, or
   * warns once per recent locale/key pair unless silent.
   * @throws {Error} When called before successful initialization.
   * @throws {TypeError} When the key is empty, not a string, longer than 1,000 characters, or contains ASCII controls.
   */
  translate<K extends TKey>(key: K, ...params: TranslateParams<TMessages, K>): string;

  /**
   * Whether a key has a text, or is a plural group, in a dictionary the active locale falls back to. Unlike `t()`, a
   * miss neither calls `onMissingKey` nor warns, so a key built at runtime can be checked before it is used, and the
   * check narrows it to a key `t()` accepts. A key that is already typed is not narrowed, since it can still be missing,
   * as from a locale that has not translated it.
   *
   * @example
   * ```ts
   * const key = `errors.${code}`;
   * const message = i18n.has(key) ? i18n.t(key) : i18n.t("errors.unknown");
   * ```
   *
   * @param key - Translation key, trimmed as `t()` trims it.
   * @returns `true` when a dictionary has a text at `key`, or a plural group, one with an `other` form, and `false`
   * otherwise, including for a group without an `other` form, whichever forms it has, and for a string no dictionary
   * can hold, such as one that is blank, longer than 1,000 characters, or contains ASCII controls.
   * @throws {Error} When called before successful initialization.
   * @throws {TypeError} When the key is not a string.
   */
  has(key: TKey): boolean;
  has(key: string): key is TKey;

  /** Short alias of {@link I18n.translate}, the same bound function. */
  t<K extends TKey>(key: K, ...params: TranslateParams<TMessages, K>): string;

  /**
   * Formats a number for the active locale with `Intl.NumberFormat`.
   *
   * @param value - Number or bigint to format.
   * @param options - `Intl.NumberFormat` options, such as `{ style: "percent" }`, read by name, including inherited
   * properties, as `Intl` reads them; other properties are ignored.
   * @returns The formatted number.
   * @throws {RangeError} When `options` is out of range, as `Intl.NumberFormat` throws.
   * @throws {TypeError} When `options` is `null` or incomplete, such as a currency style without `currency`, as
   * `Intl.NumberFormat` throws.
   */
  formatNumber(value: number | bigint, options?: Intl.NumberFormatOptions): string;

  /**
   * Formats a date, or a timestamp in milliseconds, for the active locale with `Intl.DateTimeFormat`, in the
   * configured `timeZone` unless `options.timeZone` names another.
   *
   * @param value - Date, or milliseconds since the epoch.
   * @param options - `Intl.DateTimeFormat` options, such as `{ dateStyle: "long" }`, read by name, including inherited
   * properties, as `Intl` reads them; other properties are ignored. A `timeZone` of `undefined` keeps the configured
   * one.
   * @returns The formatted date.
   * @throws {RangeError} When an option or the date is invalid, such as an unknown time zone or an invalid `Date`, as
   * `Intl.DateTimeFormat` throws.
   * @throws {TypeError} When `options` is `null` or options conflict, such as `dateStyle` with `year`, as
   * `Intl.DateTimeFormat` throws.
   */
  formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string;

  /**
   * Formats a relative time, such as `-1, "day"` for "1 day ago", for the active locale with `Intl.RelativeTimeFormat`.
   *
   * @param value - Amount of `unit`, negative for the past.
   * @param unit - Unit of `value`, such as `"day"` or `"hours"`.
   * @param options - `Intl.RelativeTimeFormat` options, such as `{ numeric: "auto" }` for "yesterday".
   * @returns The formatted relative time.
   * @throws {RangeError} When `value`, `unit`, or `options` is invalid, as `Intl.RelativeTimeFormat` throws.
   */
  formatRelativeTime(
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ): string;

  /**
   * Joins strings into a list, such as "a, b, and c", for the active locale with `Intl.ListFormat`.
   *
   * @param values - Strings to join, in order.
   * @param options - `Intl.ListFormat` options, such as `{ type: "disjunction" }` for "a, b, or c".
   * @returns The joined list, or an empty string for no values.
   * @throws {RangeError} When `options` is invalid, as `Intl.ListFormat` throws.
   * @throws {TypeError} When a value is not a string, as `Intl.ListFormat` throws.
   */
  formatList(values: Iterable<string>, options?: Intl.ListFormatOptions): string;

  /**
   * Calls a listener after every applied `init()` and every applied locale change, such as to re-render a framework.
   * A stale or same-locale request, which changes nothing, does not call it.
   *
   * @param listener - Called without arguments. An exception is reported as for any `EventTarget` listener: in a
   * browser, as an uncaught error that neither stops other listeners nor rejects the change; in Node.js, it crashes the
   * process.
   * @returns A function that removes the listener; calling it again does nothing.
   */
  subscribe(listener: () => void): () => void;

  /**
   * Adds a typed lifecycle event listener.
   *
   * @param type - `ready`, dispatched after every applied `init()`, or `locale-change`, after every applied locale change.
   * @param callback - Receives the event, whose `detail` holds the locale. An exception is reported as by
   * {@link I18n.subscribe}.
   * @param options - Standard `EventTarget` listener options, such as `{ once: true }`.
   */
  addEventListener<K extends keyof I18nEventMap<TLocale>>(
    type: K,
    callback: (this: I18n<TLocale, TKey>, event: I18nEventMap<TLocale>[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  /**
   * Adds a standard event listener for interoperability with EventTarget.
   *
   * @param type - Event type; only `ready` and `locale-change` are dispatched.
   * @param callback - Standard listener, or `null`, which adds nothing.
   * @param options - Standard `EventTarget` listener options.
   */
  addEventListener(
    type: string,
    callback: EventListener | EventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void;

  /**
   * Removes a typed lifecycle event listener.
   *
   * @param type - Event type the listener was added for.
   * @param callback - The listener that was added.
   * @param options - Standard `EventTarget` options; `capture` must match the one it was added with.
   */
  removeEventListener<K extends keyof I18nEventMap<TLocale>>(
    type: K,
    callback: (this: I18n<TLocale, TKey>, event: I18nEventMap<TLocale>[K]) => void,
    options?: EventListenerOptions | boolean,
  ): void;
  /**
   * Removes a standard event listener registered through EventTarget.
   *
   * @param type - Event type the listener was added for.
   * @param callback - The listener that was added, or `null`, which removes nothing.
   * @param options - Standard `EventTarget` options; `capture` must match the one it was added with.
   */
  removeEventListener(
    type: string,
    callback: EventListener | EventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void;
}
