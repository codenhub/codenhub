export type LocaleDirection = "ltr" | "rtl";

export interface I18nConfig<TLocale extends string = string> {
  defaultLocale: TLocale;
  locales: readonly TLocale[];
  getLocaleFile(locale: TLocale): string;
  getLocaleDirection(locale: TLocale): LocaleDirection;
  isLocale(value: string): value is TLocale;
}

export interface LocaleDictionary {
  [key: string]: string;
}

export interface I18nInitOptions {
  storageKey?: string;
  root?: ParentNode;
}

export interface I18nReadyEventDetail {
  locale: string;
  translationsAvailable: boolean;
}

export interface I18nLocaleChangeEventDetail {
  locale: string;
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
