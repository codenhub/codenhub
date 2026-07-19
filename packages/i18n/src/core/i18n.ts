import { createLocaleLoader, type LocaleLoader } from "../locale/loader";
import { resolveConfiguredLocale, validateI18nConfig, type ValidatedI18nConfig } from "../locale/resolution";
import type {
  I18n,
  I18nConfig,
  I18nEventMap,
  I18nInitOptions,
  I18nLocaleChangeEventDetail,
  I18nReadyEventDetail,
  LocaleDictionary,
  LocaleDirection,
} from "./types";

interface RequiredDictionaries {
  readonly current: LocaleDictionary;
  readonly fallback: LocaleDictionary;
}

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
  private readonly warnedMissingKeys = new Set<string>();
  private readonly config: ValidatedI18nConfig<TLocale>;
  private readonly loader: LocaleLoader<TLocale>;

  constructor(config: I18nConfig<TLocale>) {
    super();
    this.config = validateI18nConfig(config);
    this.defaultLocale = this.config.defaultLocale;
    this.locales = this.config.locales;
    this.isSilent = this.config.isSilent;
    this.currentLocale = this.defaultLocale;
    this.currentDirection = this.resolveLocaleDirection(this.defaultLocale);
    this.loader = createLocaleLoader({ loadLocale: this.config.loadLocale });
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
    return resolveConfiguredLocale(this.locales, value);
  }

  async loadLocale(locale: TLocale): Promise<LocaleDictionary> {
    return this.loader.loadLocale(this.requireLocale(locale));
  }

  async init(options: I18nInitOptions<TLocale> = {}): Promise<void> {
    const requestedLocale = options.locale === undefined ? this.defaultLocale : options.locale;
    const locale = this.requireLocale(requestedLocale);
    const requestId = this.createRequest();
    const dictionaries = await this.loadRequiredDictionaries(locale);
    const direction = this.resolveLocaleDirection(locale);

    if (!this.isLatestRequest(requestId)) {
      return;
    }

    this.currentLocale = locale;
    this.currentDirection = direction;
    this.currentDictionary = dictionaries.current;
    this.defaultDictionary = dictionaries.fallback;
    this.isReadyState = true;
    this.dispatchEvent(createCustomEvent<I18nReadyEventDetail<TLocale>>("ready", { locale }));
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

  translate(key: string): string | undefined {
    if (!this.isReadyState || this.currentDictionary === undefined || this.defaultDictionary === undefined) {
      throw new Error("[I18n] translate() requires successful initialization.");
    }

    if (typeof key !== "string" || key.trim().length === 0) {
      throw new TypeError("[I18n] A translation key must be a non-empty string.");
    }

    const normalizedKey = key.trim();
    const translation = this.currentDictionary[normalizedKey] ?? this.defaultDictionary[normalizedKey];

    if (translation !== undefined) {
      return translation;
    }

    const warningKey = `${this.currentLocale}\0${normalizedKey}`;

    if (!this.isSilent && !this.warnedMissingKeys.has(warningKey)) {
      this.warnedMissingKeys.add(warningKey);
      console.warn(`[I18n] Missing key "${normalizedKey}" in locale "${this.currentLocale}".`);
    }

    return undefined;
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
 * @typeParam TLocale - Union of supported canonical locale identifiers.
 * @param config - Locale metadata and injected loading/direction callbacks.
 * @returns An uninitialized consumer-owned manager.
 * @throws {TypeError} When configuration is invalid.
 */
export function createI18n<TLocale extends string>(config: I18nConfig<TLocale>): I18n<TLocale> {
  return new I18nInstance(config);
}
