import { createLocaleLoader, type LocaleLoader } from "../locale/loader";
import { matchConfiguredLocale } from "../locale/matching";
import { validateI18nConfig, type ValidatedI18nConfig } from "../locale/resolution";
import { registerI18nInternals } from "./internals";
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

interface RequiredDictionaries {
  readonly current: LocaleDictionary;
  readonly fallback: LocaleDictionary;
}

const MAX_MISSING_KEY_DIAGNOSTICS = 1_000;
const MAX_TRANSLATION_KEY_LENGTH = 1_000;
const PLACEHOLDER_PATTERN = /{([A-Za-z0-9_]+)}/g;

type TranslationParams = Readonly<Record<string, string | number>>;

const interpolate = (text: string, params: TranslationParams): string =>
  text.replace(PLACEHOLDER_PATTERN, (placeholder, name: string) => {
    const value: unknown = Object.hasOwn(params, name) ? params[name] : undefined;
    return typeof value === "string" || typeof value === "number" ? String(value) : placeholder;
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

class I18nInstance<TLocale extends string> extends EventTarget implements I18n<TLocale> {
  readonly defaultLocale: TLocale;
  readonly locales: readonly TLocale[];
  readonly isSilent: boolean;

  private currentLocale: TLocale;
  private currentDirection: LocaleDirection;
  private isReadyState = false;
  private currentDictionary: LocaleDictionary | undefined;
  private defaultDictionary: LocaleDictionary | undefined;
  private requestId = 0;
  private readonly warnedMissingKeys = new Map<string, undefined>();
  private readonly pluralRules = new Map<TLocale, Intl.PluralRules | undefined>();
  private readonly localeLookup: ReadonlyMap<string, TLocale>;
  private readonly config: ValidatedI18nConfig<TLocale>;
  private readonly loader: LocaleLoader<TLocale>;

  readonly t: (key: string, params?: TranslationParams) => string;

  constructor(config: I18nConfig<TLocale>) {
    super();
    // Bound so a destructured method, such as `const { t } = i18n`, still reaches its manager.
    this.init = this.init.bind(this);
    this.loadLocale = this.loadLocale.bind(this);
    this.setLocale = this.setLocale.bind(this);
    this.resolveLocale = this.resolveLocale.bind(this);
    this.matchLocale = this.matchLocale.bind(this);
    this.translate = this.translate.bind(this);
    this.subscribe = this.subscribe.bind(this);
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
    this.loader = createLocaleLoader({
      loadLocale: this.config.loadLocale,
      dictionaryLimits: this.config.dictionaryLimits,
    });
    registerI18nInternals(this, {
      init: (options) => this.applyInit(options as I18nInitOptions<TLocale>),
      lookup: (key) => this.lookup(key),
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

  translate(key: string, params?: TranslationParams): string {
    const count = params !== undefined && Object.hasOwn(params, "count") ? params["count"] : undefined;
    const translation = this.lookup(key, typeof count === "number" ? count : undefined);

    if (translation === undefined) {
      return key.trim();
    }

    return params === undefined ? translation : interpolate(translation, params);
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

  private async applyInit(options: I18nInitOptions<TLocale> = {}): Promise<boolean> {
    const requestedLocale = options.locale === undefined ? this.defaultLocale : options.locale;
    const locale = this.requireLocale(requestedLocale);
    const requestId = this.createRequest();
    const dictionaries = await this.loadRequiredDictionaries(locale);
    const direction = this.resolveLocaleDirection(locale);

    if (!this.isLatestRequest(requestId)) {
      return false;
    }

    this.currentLocale = locale;
    this.currentDirection = direction;
    this.currentDictionary = dictionaries.current;
    this.defaultDictionary = dictionaries.fallback;
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
    this.currentDictionary = dictionaries.current;
    this.defaultDictionary = dictionaries.fallback;
    this.dispatchEvent(
      createCustomEvent<I18nLocaleChangeEventDetail<TLocale>>("locale-change", {
        locale: nextLocale,
        previousLocale,
      }),
    );
  }

  private lookup(key: string, count?: number): string | undefined {
    if (!this.isReadyState || this.currentDictionary === undefined || this.defaultDictionary === undefined) {
      throw new Error("[I18n] translate() requires successful initialization.");
    }

    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("[I18n] A translation key must be a non-empty string.");
    }

    if (key.length > MAX_TRANSLATION_KEY_LENGTH || hasAsciiControlCharacter(key)) {
      throw new TypeError(
        `[I18n] A translation key must not contain ASCII control characters or exceed ${MAX_TRANSLATION_KEY_LENGTH} characters.`,
      );
    }

    const normalizedKey = key.trim();

    if (normalizedKey.length === 0) {
      throw new TypeError("[I18n] A translation key must be a non-empty string.");
    }

    const translation =
      this.findTranslation(this.currentDictionary, this.currentLocale, normalizedKey, count) ??
      this.findTranslation(this.defaultDictionary, this.defaultLocale, normalizedKey, count);

    if (translation !== undefined) {
      return translation;
    }

    this.reportMissingKey(normalizedKey);
    return undefined;
  }

  /**
   * Finds the exact key, or with a count, the plural form of the group at `key`. The form is chosen with the rules of
   * the locale whose dictionary is read, since a fallback text is in the default locale's language.
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
    return dictionary[`${key}.${category}`] ?? dictionary[`${key}.other`];
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

  private async loadRequiredDictionaries(locale: TLocale): Promise<RequiredDictionaries> {
    if (locale === this.defaultLocale) {
      const dictionary = await this.loader.loadLocale(locale);
      return { current: dictionary, fallback: dictionary };
    }

    const [current, fallback] = await Promise.all([
      this.loader.loadLocale(locale),
      this.loader.loadLocale(this.defaultLocale),
    ]);
    return { current, fallback };
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
): I18n<TLocale, TranslationKey<TMessages>> {
  return new I18nInstance(config);
}
