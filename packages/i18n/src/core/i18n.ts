import { createFallbackChains } from "../locale/fallback";
import { createLocaleLoader, type LocaleLoader } from "../locale/loader";
import { matchConfiguredLocale } from "../locale/matching";
import { validateI18nConfig, type ValidatedI18nConfig } from "../locale/resolution";
import { registerI18nInternals } from "./internals";
import {
  copyDateTimeFormatOptions,
  formatMessage,
  formatPlainValue,
  getDateTimeFormat,
  getNumberFormat,
  intlLocale,
  isPlainMessage,
  MessageSyntaxError,
  type MessageValues,
  parseCachedMessage,
} from "./message-format";
import { hasAsciiControlCharacter } from "./string-validation";
import type {
  I18n,
  I18nConfig,
  I18nEventMap,
  I18nInitOptions,
  I18nLocaleChangeEventDetail,
  I18nReadyEventDetail,
  LocaleDictionary,
  LocaleDirection,
  TranslationKey,
} from "./types";

/** A dictionary in the fallback chain, with the locale whose plural rules it uses. */
interface ChainDictionary<TLocale extends string> {
  readonly locale: TLocale;
  readonly dictionary: LocaleDictionary;
}

const MAX_MISSING_KEY_DIAGNOSTICS = 1_000;
const MAX_MESSAGE_DIAGNOSTICS = 1_000;
const MAX_TRANSLATION_KEY_LENGTH = 1_000;
const PLACEHOLDER_PATTERN = /{([A-Za-z0-9_]+)}/g;
// The form every plural group has, used when the count's category has none.
const PLURAL_FALLBACK_FORM = "other";

/** Whether a string can name a dictionary entry: not blank, within the length limit, and free of ASCII controls. */
const isValidTranslationKey = (key: string): boolean =>
  key.trim().length > 0 && key.length <= MAX_TRANSLATION_KEY_LENGTH && !hasAsciiControlCharacter(key);

/** A translation found in the fallback chain, with the locale of the dictionary that has it. */
interface FoundTranslation<TLocale extends string> {
  readonly text: string;
  readonly locale: TLocale;
}

interface InterpolateOptions {
  readonly text: string;
  readonly params: MessageValues;
  readonly locale: string;
  readonly timeZone: string | undefined;
}

/** Fills only `{name}` placeholders, as a message that is not valid ICU syntax is shown. */
const interpolate = ({ text, params, locale, timeZone }: InterpolateOptions): string =>
  text.replace(PLACEHOLDER_PATTERN, (placeholder, name: string) => {
    const value: unknown = Object.hasOwn(params, name) ? params[name] : undefined;
    return formatPlainValue(value, locale, timeZone) ?? placeholder;
  });

class CoreCustomEvent<TDetail> extends Event implements CustomEvent<TDetail> {
  private eventDetail: TDetail;

  constructor(type: string, init: CustomEventInit<TDetail>) {
    super(type, init);
    this.eventDetail = init.detail as TDetail;
  }

  get detail(): TDetail {
    return this.eventDetail;
  }

  initCustomEvent(type: string, bubbles = false, cancelable = false, detail?: TDetail): void {
    this.initEvent(type, bubbles, cancelable);
    this.eventDetail = detail as TDetail;
  }
}

const createCustomEvent = <TDetail>(type: string, detail: TDetail): CustomEvent<TDetail> => {
  const init = { detail };

  if (typeof CustomEvent === "function") {
    return new CustomEvent<TDetail>(type, init);
  }

  return new CoreCustomEvent(type, init);
};

class I18nInstance<TLocale extends string, TKey extends string = string>
  extends EventTarget
  implements I18n<TLocale, TKey>
{
  readonly defaultLocale: TLocale;
  readonly locales: readonly TLocale[];
  readonly isSilent: boolean;

  private currentLocale: TLocale;
  private currentDirection: LocaleDirection;
  private isReadyState = false;
  private dictionaries: readonly ChainDictionary<TLocale>[] | undefined;
  private readonly fallbackChains: ReadonlyMap<TLocale, readonly TLocale[]>;
  private requestId = 0;
  private readonly warnedMissingKeys = new Map<string, undefined>();
  private readonly pluralRules = new Map<TLocale, Intl.PluralRules | undefined>();
  private readonly localeLookup: ReadonlyMap<string, TLocale>;
  private readonly config: ValidatedI18nConfig<TLocale>;
  private readonly loader: LocaleLoader<TLocale>;

  readonly t: (key: string, params?: MessageValues) => string;
  private readonly warnedMessages = new Set<string>();

  constructor(config: I18nConfig<TLocale>) {
    super();
    // Bound so a destructured method, such as `const { t } = i18n`, still reaches its manager.
    this.init = this.init.bind(this);
    this.loadLocale = this.loadLocale.bind(this);
    this.setLocale = this.setLocale.bind(this);
    this.resolveLocale = this.resolveLocale.bind(this);
    this.matchLocale = this.matchLocale.bind(this);
    this.translate = this.translate.bind(this);
    this.has = this.has.bind(this) as I18nInstance<TLocale, TKey>["has"];
    this.subscribe = this.subscribe.bind(this);
    this.formatNumber = this.formatNumber.bind(this);
    this.formatDate = this.formatDate.bind(this);
    this.formatRelativeTime = this.formatRelativeTime.bind(this);
    this.formatList = this.formatList.bind(this);
    this.addEventListener = this.addEventListener.bind(this) as I18nInstance<TLocale>["addEventListener"];
    this.removeEventListener = this.removeEventListener.bind(this) as I18nInstance<TLocale>["removeEventListener"];
    this.t = this.translate;
    this.config = validateI18nConfig(config);
    this.defaultLocale = this.config.defaultLocale;
    this.locales = this.config.locales;
    this.isSilent = this.config.isSilent;
    this.currentLocale = this.defaultLocale;
    this.currentDirection = this.resolveLocaleDirection(this.defaultLocale);
    this.localeLookup = new Map(this.locales.map((locale) => [locale.toLowerCase(), locale]));
    this.fallbackChains = createFallbackChains(this.locales, this.defaultLocale);
    this.loader = createLocaleLoader({
      loadLocale: this.config.loadLocale,
      dictionaryLimits: this.config.dictionaryLimits,
    });
    registerI18nInternals(this, {
      init: (options) => this.applyInit(options as I18nInitOptions<TLocale>, true),
      lookup: (key) => {
        const found = this.lookup("translate", key);
        return found === undefined ? undefined : this.format(key, found, {});
      },
    });
  }

  get locale(): TLocale {
    return this.currentLocale;
  }

  get direction(): LocaleDirection {
    return this.currentDirection;
  }

  get isReady(): boolean {
    return this.isReadyState;
  }

  resolveLocale(value: string): TLocale | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    return this.localeLookup.get(value.trim().toLowerCase());
  }

  matchLocale(preferences: readonly string[]): TLocale | undefined {
    if (!Array.isArray(preferences)) {
      throw new TypeError("[I18n] Locale preferences must be an array.");
    }

    return matchConfiguredLocale(this.locales, preferences);
  }

  async loadLocale(locale: TLocale): Promise<LocaleDictionary> {
    return this.loader.loadLocale(this.requireLocale(locale));
  }

  async init(options?: I18nInitOptions<TLocale>): Promise<void> {
    await this.applyInit(options);
  }

  translate(key: string, params?: MessageValues): string {
    const count = params !== undefined && Object.hasOwn(params, "count") ? params["count"] : undefined;
    const found = this.lookup("translate", key, typeof count === "number" ? count : undefined);

    return found === undefined ? key.trim() : this.format(key, found, params ?? {});
  }

  has(key: TKey): boolean;
  has(key: string): key is TKey;
  has(key: string): boolean {
    if (!this.isReadyState) {
      throw new Error("[I18n] has() requires successful initialization.");
    }
    if (typeof key !== "string") {
      throw new TypeError("[I18n] A translation key must be a non-empty string.");
    }
    // A key built from outside input, such as `errors.${code}`, can be one no dictionary holds; that is a miss.
    if (!isValidTranslationKey(key)) {
      return false;
    }
    // Only a group with an `other` form is a plural group. Choosing a form by count would make a group without one, such
    // as `{ one, two }`, a key in a locale where the count's category is a form it has, and not in others.
    return (
      this.lookup("has", key) !== undefined ||
      this.dictionaries!.some(({ dictionary }) => dictionary[`${key.trim()}.${PLURAL_FALLBACK_FORM}`] !== undefined)
    );
  }

  formatNumber(value: number | bigint, options?: Intl.NumberFormatOptions): string {
    return getNumberFormat(this.currentLocale, options).format(value);
  }

  formatDate(value: Date | number, options: Intl.DateTimeFormatOptions = {}): string {
    if (options === null) {
      return getDateTimeFormat(this.currentLocale, options).format(value);
    }
    // The copy holds inherited options too, which a spread would drop, and reads a primitive through its wrapper object,
    // as Intl does. `timeZone: undefined`, as forwarded options often carry, names no zone, so the configured one still
    // applies; any other value, even `null`, is Intl's to judge.
    const copy = copyDateTimeFormatOptions(Object(options) as Intl.DateTimeFormatOptions);
    return getDateTimeFormat(
      this.currentLocale,
      copy.timeZone === undefined ? { ...copy, timeZone: this.config.timeZone } : copy,
    ).format(value);
  }

  formatRelativeTime(
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ): string {
    return new Intl.RelativeTimeFormat(intlLocale(this.currentLocale), options).format(value, unit);
  }

  formatList(values: Iterable<string>, options?: Intl.ListFormatOptions): string {
    return new Intl.ListFormat(intlLocale(this.currentLocale), options).format(values);
  }

  /** Formats a found text as an ICU message in its dictionary's locale, falling back to `{name}` for invalid syntax. */
  private format(key: string, found: FoundTranslation<TLocale>, params: MessageValues): string {
    if (isPlainMessage(found.text)) {
      return found.text;
    }

    const message = parseCachedMessage(found.text);
    if (message instanceof MessageSyntaxError) {
      this.reportInvalidMessage(key, found, message);
      return interpolate({ text: found.text, params, locale: found.locale, timeZone: this.config.timeZone });
    }

    return formatMessage(message, params, found.locale, this.config.timeZone);
  }

  private reportInvalidMessage(key: string, found: FoundTranslation<TLocale>, error: MessageSyntaxError): void {
    const warningKey = `${found.locale}\0${found.text}`;

    if (this.isSilent || this.warnedMessages.has(warningKey)) {
      return;
    }
    if (this.warnedMessages.size >= MAX_MESSAGE_DIAGNOSTICS) {
      this.warnedMessages.delete(this.warnedMessages.values().next().value!);
    }
    this.warnedMessages.add(warningKey);
    console.warn(
      `[I18n] Invalid message for "${key.trim()}" in locale "${found.locale}": ${error.message}; only {name} ` +
        "placeholders are filled. " +
        JSON.stringify(found.text.slice(0, 200)),
    );
  }

  subscribe(listener: () => void): () => void {
    const notify = (): void => listener();
    let isSubscribed = true;

    this.addEventListener("ready", notify);
    this.addEventListener("locale-change", notify);

    return () => {
      if (isSubscribed) {
        isSubscribed = false;
        this.removeEventListener("ready", notify);
        this.removeEventListener("locale-change", notify);
      }
    };
  }

  /**
   * Initializes, resolving whether this call applied state. With `isFailureSuperseded`, a call superseded before its
   * loading fails also resolves false rather than rejecting, so a caller that retries on failure cannot override the
   * later call.
   */
  private async applyInit(options: I18nInitOptions<TLocale> = {}, isFailureSuperseded = false): Promise<boolean> {
    const requestedLocale = options.locale === undefined ? this.defaultLocale : options.locale;
    const locale = this.requireLocale(requestedLocale);
    const requestId = this.createRequest();
    let dictionaries: readonly ChainDictionary<TLocale>[];
    let direction: LocaleDirection;

    try {
      dictionaries = await this.loadRequiredDictionaries(locale);
      direction = this.resolveLocaleDirection(locale);
    } catch (error) {
      if (isFailureSuperseded && !this.isLatestRequest(requestId)) {
        return false;
      }
      throw error;
    }

    if (!this.isLatestRequest(requestId)) {
      return false;
    }

    this.currentLocale = locale;
    this.currentDirection = direction;
    this.dictionaries = dictionaries;
    this.isReadyState = true;
    this.dispatchEvent(createCustomEvent<I18nReadyEventDetail<TLocale>>("ready", { locale }));
    return true;
  }

  async setLocale(locale: TLocale): Promise<void> {
    if (!this.isReadyState) {
      throw new Error("[I18n] setLocale() requires successful initialization.");
    }

    const nextLocale = this.requireLocale(locale);
    const requestId = this.createRequest();

    if (nextLocale === this.currentLocale) {
      return;
    }

    const dictionaries = await this.loadRequiredDictionaries(nextLocale);
    const direction = this.resolveLocaleDirection(nextLocale);

    if (!this.isLatestRequest(requestId)) {
      return;
    }

    const previousLocale = this.currentLocale;
    this.currentLocale = nextLocale;
    this.currentDirection = direction;
    this.dictionaries = dictionaries;
    this.dispatchEvent(
      createCustomEvent<I18nLocaleChangeEventDetail<TLocale>>("locale-change", {
        locale: nextLocale,
        previousLocale,
      }),
    );
  }

  /**
   * Finds a key, or with a count, a plural group's form, through the active fallback chain. Errors name `caller`, and a
   * miss is reported only for `translate`, since `has` exists to check silently.
   */
  private lookup(caller: "translate" | "has", key: string, count?: number): FoundTranslation<TLocale> | undefined {
    if (!this.isReadyState || this.dictionaries === undefined) {
      throw new Error(`[I18n] ${caller}() requires successful initialization.`);
    }

    if (typeof key !== "string" || key.trim().length === 0) {
      throw new TypeError("[I18n] A translation key must be a non-empty string.");
    }

    if (!isValidTranslationKey(key)) {
      throw new TypeError(
        `[I18n] A translation key must not contain ASCII control characters or exceed ${MAX_TRANSLATION_KEY_LENGTH} characters.`,
      );
    }

    const normalizedKey = key.trim();

    for (const { locale, dictionary } of this.dictionaries) {
      const translation = this.findTranslation(dictionary, locale, normalizedKey, count);

      if (translation !== undefined) {
        return { text: translation, locale };
      }
    }

    if (caller === "translate") {
      this.reportMissingKey(normalizedKey);
    }
    return undefined;
  }

  /**
   * Finds the exact key, or with a count, the plural form of the group at `key`. The form is chosen with the rules of
   * the locale whose dictionary is read, since a fallback text is in that locale's language.
   */
  private findTranslation(
    dictionary: LocaleDictionary,
    locale: TLocale,
    key: string,
    count: number | undefined,
  ): string | undefined {
    const translation = dictionary[key];

    if (translation !== undefined || count === undefined) {
      return translation;
    }

    const category = this.getPluralRules(locale)?.select(count) ?? "other";
    return dictionary[`${key}.${category}`] ?? dictionary[`${key}.${PLURAL_FALLBACK_FORM}`];
  }

  private getPluralRules(locale: TLocale): Intl.PluralRules | undefined {
    if (!this.pluralRules.has(locale)) {
      let rules: Intl.PluralRules | undefined;

      try {
        rules = new Intl.PluralRules(locale);
      } catch {
        // A locale `Intl` cannot read, such as private-use `x-test`, has no rules, so every count uses `other`.
        rules = undefined;
      }

      this.pluralRules.set(locale, rules);
    }

    return this.pluralRules.get(locale);
  }

  private reportMissingKey(key: string): void {
    if (this.config.onMissingKey !== undefined) {
      this.config.onMissingKey(key, this.currentLocale);
      return;
    }

    const warningKey = `${this.currentLocale}\0${key}`;

    if (!this.isSilent) {
      if (this.warnedMissingKeys.delete(warningKey)) {
        this.warnedMissingKeys.set(warningKey, undefined);
        return;
      }

      this.warnedMissingKeys.set(warningKey, undefined);

      if (this.warnedMissingKeys.size > MAX_MISSING_KEY_DIAGNOSTICS) {
        const oldestWarningKey = this.warnedMissingKeys.keys().next().value;

        if (oldestWarningKey !== undefined) {
          this.warnedMissingKeys.delete(oldestWarningKey);
        }
      }

      console.warn(`[I18n] Missing key "${key}" in locale "${this.currentLocale}".`);
    }
  }

  addEventListener<K extends keyof I18nEventMap<TLocale>>(
    type: K,
    callback: (this: I18n<TLocale>, event: I18nEventMap<TLocale>[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  override addEventListener(
    type: string,
    callback: EventListener | EventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void;
  override addEventListener(
    type: string,
    callback: EventListener | EventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    super.addEventListener(type, callback, options);
  }

  removeEventListener<K extends keyof I18nEventMap<TLocale>>(
    type: K,
    callback: (this: I18n<TLocale>, event: I18nEventMap<TLocale>[K]) => void,
    options?: EventListenerOptions | boolean,
  ): void;
  override removeEventListener(
    type: string,
    callback: EventListener | EventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void;
  override removeEventListener(
    type: string,
    callback: EventListener | EventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    super.removeEventListener(type, callback, options);
  }

  private requireLocale(value: TLocale): TLocale {
    const locale = this.resolveLocale(value);

    if (locale === undefined) {
      throw new RangeError(`[I18n] Unsupported locale "${String(value)}".`);
    }

    return locale;
  }

  private resolveLocaleDirection(locale: TLocale): LocaleDirection {
    const direction = this.config.getLocaleDirection(locale);

    if (direction !== "ltr" && direction !== "rtl") {
      throw new TypeError(`[I18n] Invalid direction for locale "${locale}".`);
    }

    return direction;
  }

  /** Loads the locale and every locale it falls back to, together, such as `pt-BR`, `pt`, and the default. */
  private async loadRequiredDictionaries(locale: TLocale): Promise<readonly ChainDictionary<TLocale>[]> {
    const chain = this.fallbackChains.get(locale)!;
    const dictionaries = await Promise.all(chain.map((chainLocale) => this.loader.loadLocale(chainLocale)));
    return chain.map((chainLocale, index) => ({ locale: chainLocale, dictionary: dictionaries[index]! }));
  }

  private createRequest(): number {
    this.requestId += 1;
    return this.requestId;
  }

  private isLatestRequest(requestId: number): boolean {
    return requestId === this.requestId;
  }
}

/**
 * Creates an isolated runtime-neutral translation manager.
 *
 * @example
 * ```ts
 * // src/i18n.ts in a browser application: create the manager once and import it, or its bound `t`, wherever
 * // text is needed. Servers and builds that render concurrently create one manager per request or page instead.
 * export const i18n = createI18n({
 *   defaultLocale: "en",
 *   locales: ["en", "pt"] as const,
 *   loadLocale: (locale) => dictionaries[locale],
 * });
 * export const { t } = i18n;
 * ```
 *
 * @typeParam TLocale - Union of supported canonical locale identifiers.
 * @typeParam TMessages - Dictionary type returned by `loadLocale`, inferred to type translation keys.
 * @param config - ASCII locale metadata and injected loading/direction callbacks, as a plain object whose
 * own properties are read. Locales are trimmed,
 * case-insensitively unique, and composed of alphanumeric hyphen-separated subtags. `isSilent` defaults to false.
 * @returns An uninitialized consumer-owned manager whose initial direction has already been resolved.
 * @throws {TypeError} When configuration or the initial direction is invalid.
 * Exceptions from the initial direction callback propagate unchanged.
 */
export function createI18n<TLocale extends string, TMessages = unknown>(
  config: I18nConfig<TLocale, TMessages>,
): I18n<TLocale, TranslationKey<TMessages>, TMessages> {
  return new I18nInstance<TLocale, TranslationKey<TMessages>>(config);
}
