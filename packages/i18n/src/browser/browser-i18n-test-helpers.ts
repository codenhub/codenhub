import { afterEach, beforeEach, vi } from "vitest";

import { createI18n, type I18nConfig } from "../index";

export const LOCALES = ["en", "pt-BR", "fr", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const dictionaries: Record<Locale, unknown> = {
  en: { greeting: "Hello", fallbackOnly: "English fallback" },
  "pt-BR": { greeting: "Ola" },
  fr: { greeting: "Bonjour", frOnly: "Francais seulement" },
  ar: { greeting: "Marhaba" },
};

export const createManager = (overrides: Partial<I18nConfig<Locale>> = {}) =>
  createI18n({
    defaultLocale: "en",
    locales: LOCALES,
    loadLocale: (locale) => dictionaries[locale],
    getLocaleDirection: (locale) => (locale === "ar" ? "rtl" : "ltr"),
    ...overrides,
  });

export const setNavigatorLocales = (languages: readonly string[], language = languages[0] ?? "") => {
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(languages);
  vi.spyOn(window.navigator, "language", "get").mockReturnValue(language);
};

export const flushMutations = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

export const createDeferred = <T>(): Deferred<T> => {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
  };
};

export const setupBrowserTestHooks = () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
    document.documentElement.dir = "";
    document.body.replaceChildren();
    setNavigatorLocales([], "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
};
