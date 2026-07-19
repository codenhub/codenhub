// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { createI18n, I18nError, type I18n, type I18nConfig } from "../index";

const LOCALES = ["en", "pt", "ar"] as const;
type Locale = (typeof LOCALES)[number];

const dictionaries: Record<Locale, unknown> = {
  en: { common: { greeting: "Hello", farewell: "Goodbye" } },
  pt: { common: { greeting: "Ola" } },
  ar: { common: { greeting: "مرحبا" } },
};

const createConfig = (overrides: Partial<I18nConfig<Locale>> = {}): I18nConfig<Locale> => ({
  defaultLocale: "en",
  locales: LOCALES,
  loadLocale: vi.fn((locale: Locale) => dictionaries[locale]),
  getLocaleDirection: (locale) => (locale === "ar" ? "rtl" : "ltr"),
  ...overrides,
});

const listenForLifecycleEvents = (i18n: I18n<Locale>) => {
  const onReady = vi.fn();
  const onLocaleChange = vi.fn();
  i18n.addEventListener("ready", onReady);
  i18n.addEventListener("locale-change", onLocaleChange);
  return { onReady, onLocaleChange };
};

const createDeferred = <T>() => {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: (value: T) => resolvePromise?.(value) };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("I18n state", () => {
  it("loads selected and default dictionaries for deterministic key fallback", async () => {
    const loadLocale = vi.fn((locale: Locale) => dictionaries[locale]);
    const i18n = createI18n(createConfig({ loadLocale }));
    await i18n.init({ locale: "pt" });

    expect(loadLocale).toHaveBeenCalledTimes(2);
    expect(loadLocale).toHaveBeenCalledWith("pt");
    expect(loadLocale).toHaveBeenCalledWith("en");
    expect(i18n.translate("common.greeting")).toBe("Ola");
    expect(i18n.translate("common.farewell")).toBe("Goodbye");
  });

  it("keeps initial state not ready when a required loader rejects", async () => {
    const cause = new Error("offline");
    const i18n = createI18n(createConfig({ loadLocale: vi.fn().mockRejectedValue(cause) }));
    const { onReady, onLocaleChange } = listenForLifecycleEvents(i18n);
    const initialization = i18n.init();

    await expect(initialization).rejects.toMatchObject({ code: "locale_load_failed", locale: "en", cause });
    await expect(initialization).rejects.toBeInstanceOf(I18nError);
    expect(i18n.isReady).toBe(false);
    expect(() => i18n.translate("common.greeting")).toThrow(Error);
    expect(onReady).not.toHaveBeenCalled();
    expect(onLocaleChange).not.toHaveBeenCalled();
  });

  it("does not emit when required default fallback loading fails", async () => {
    const loadLocale = vi.fn((locale: Locale) => {
      if (locale === "en") {
        throw new Error("default unavailable");
      }
      return dictionaries[locale];
    });
    const i18n = createI18n(createConfig({ loadLocale }));
    const { onReady, onLocaleChange } = listenForLifecycleEvents(i18n);

    await expect(i18n.init({ locale: "pt" })).rejects.toBeInstanceOf(I18nError);
    expect(i18n.isReady).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
    expect(onLocaleChange).not.toHaveBeenCalled();
  });

  it("keeps dictionary failures as native TypeError", async () => {
    const i18n = createI18n(createConfig({ loadLocale: () => ({ key: 1 }) }));

    await expect(i18n.init()).rejects.toBeInstanceOf(TypeError);
    expect(i18n.isReady).toBe(false);
  });

  it("preserves the previous ready state when re-init fails", async () => {
    const loadLocale = vi.fn((locale: Locale) => {
      if (locale === "pt") {
        throw new Error("pt unavailable");
      }
      return dictionaries[locale];
    });
    const i18n = createI18n(createConfig({ loadLocale }));
    await i18n.init();
    const { onReady, onLocaleChange } = listenForLifecycleEvents(i18n);

    await expect(i18n.init({ locale: "pt" })).rejects.toBeInstanceOf(I18nError);
    expect(i18n.isReady).toBe(true);
    expect(i18n.locale).toBe("en");
    expect(i18n.direction).toBe("ltr");
    expect(i18n.translate("common.greeting")).toBe("Hello");
    expect(onReady).not.toHaveBeenCalled();
    expect(onLocaleChange).not.toHaveBeenCalled();
  });

  it("atomically changes locale, direction, and emits typed event detail", async () => {
    const i18n = createI18n(createConfig());
    const listener = vi.fn();
    await i18n.init();
    i18n.addEventListener("locale-change", listener);
    await i18n.setLocale("ar");

    expect(i18n.locale).toBe("ar");
    expect(i18n.direction).toBe("rtl");
    expect(i18n.translate("common.greeting")).toBe("مرحبا");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0].detail).toEqual({ locale: "ar", previousLocale: "en" });
  });

  it("does not emit when setting the already active loaded locale", async () => {
    const loadLocale = vi.fn((locale: Locale) => dictionaries[locale]);
    const i18n = createI18n(createConfig({ loadLocale }));
    const listener = vi.fn();
    await i18n.init();
    i18n.addEventListener("locale-change", listener);
    await i18n.setLocale("en");

    expect(loadLocale).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("preserves ready state when a locale change fails", async () => {
    const cause = new Error("offline");
    const loadLocale = vi.fn((locale: Locale) => {
      if (locale === "pt") {
        throw cause;
      }
      return dictionaries[locale];
    });
    const i18n = createI18n(createConfig({ loadLocale }));
    await i18n.init();
    const { onReady, onLocaleChange } = listenForLifecycleEvents(i18n);

    await expect(i18n.setLocale("pt")).rejects.toMatchObject({ code: "locale_load_failed", cause });
    expect(i18n.locale).toBe("en");
    expect(i18n.direction).toBe("ltr");
    expect(i18n.isReady).toBe(true);
    expect(i18n.translate("common.greeting")).toBe("Hello");
    expect(onReady).not.toHaveBeenCalled();
    expect(onLocaleChange).not.toHaveBeenCalled();
  });

  it("lets the latest locale request win without a stale event", async () => {
    const ptLoad = createDeferred<unknown>();
    const loadLocale = vi.fn((locale: Locale) => (locale === "pt" ? ptLoad.promise : dictionaries[locale]));
    const i18n = createI18n(createConfig({ loadLocale }));
    const listener = vi.fn();
    await i18n.init();
    i18n.addEventListener("locale-change", listener);

    const staleChange = i18n.setLocale("pt");
    const latestChange = i18n.setLocale("en");
    ptLoad.resolve(dictionaries.pt);
    await Promise.all([staleChange, latestChange]);
    expect(i18n.locale).toBe("en");
    expect(i18n.translate("common.greeting")).toBe("Hello");
    expect(listener).not.toHaveBeenCalled();
  });

  it("lets the latest overlapping initialization win", async () => {
    const ptLoad = createDeferred<unknown>();
    const loadLocale = vi.fn((locale: Locale) => (locale === "pt" ? ptLoad.promise : dictionaries[locale]));
    const i18n = createI18n(createConfig({ loadLocale }));
    const listener = vi.fn();
    i18n.addEventListener("ready", listener);

    const staleInit = i18n.init({ locale: "pt" });
    const latestInit = i18n.init({ locale: "en" });
    await latestInit;
    ptLoad.resolve(dictionaries.pt);
    await staleInit;
    expect(i18n.locale).toBe("en");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("warns once per missing locale key unless silent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = createI18n(createConfig());
    await i18n.init();
    expect(i18n.translate("missing")).toBeUndefined();
    expect(i18n.translate(" missing ")).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);

    const silentI18n = createI18n(createConfig({ isSilent: true }));
    await silentI18n.init();
    silentI18n.translate("missing");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(silentI18n.isSilent).toBe(true);
  });

  it("rejects an empty translation key with native TypeError", async () => {
    const i18n = createI18n(createConfig());
    await i18n.init();
    expect(() => i18n.translate(" ")).toThrow(TypeError);
  });

  it.each([null, 1, Symbol("key")])("rejects a non-string translation key %s at runtime", async (key) => {
    const i18n = createI18n(createConfig());
    await i18n.init();
    expect(() => i18n.translate(key as unknown as string)).toThrow(TypeError);
  });
});
