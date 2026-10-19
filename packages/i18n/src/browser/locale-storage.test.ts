import { describe, expect, it, vi } from "vitest";

import { initializeBrowserI18n } from "../browser";
import { createI18n, I18nError } from "../index";
import { createManager, dictionaries, type Locale, setNavigatorLocales, setupBrowserTestHooks } from "./test-helpers";

setupBrowserTestHooks();

describe("initializeBrowserI18n locale resolution", () => {
  it("keeps an explicit locale authoritative over storage and navigator preferences", async () => {
    localStorage.setItem("i18n", JSON.stringify({ locale: "fr" }));
    setNavigatorLocales(["pt-BR"]);
    const i18n = createManager();

    await initializeBrowserI18n({ i18n, locale: "ar" });

    expect(i18n.locale).toBe("ar");
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "ar" }));
  });

  it("uses a valid persisted locale before navigator preferences", async () => {
    localStorage.setItem("custom-locale", JSON.stringify({ locale: "fr" }));
    setNavigatorLocales(["pt-BR"]);
    const i18n = createManager();

    await initializeBrowserI18n({ i18n, storageKey: "custom-locale" });

    expect(i18n.locale).toBe("fr");
  });

  it("matches navigator preferences exactly before using later preferences", async () => {
    setNavigatorLocales(["de-DE", "FR", "pt-BR"]);
    const i18n = createManager();

    await initializeBrowserI18n({ i18n, persistLocale: false });

    expect(i18n.locale).toBe("fr");
  });

  it("matches a navigator language subtag to the first configured locale", async () => {
    setNavigatorLocales(["pt-PT"]);
    const i18n = createManager();

    await initializeBrowserI18n({ i18n, persistLocale: false });

    expect(i18n.locale).toBe("pt-BR");
  });

  it.each([
    [["zh-Hant-TW"], ["en", "zh-Hans", "zh-Hant"], "zh-Hant"],
    [["pt-BR"], ["en", "pt-PT", "pt"], "pt"],
    [["sr-Latn-RS"], ["en", "sr", "sr-Latn"], "sr-Latn"],
    [["es-MX"], ["en", "es-ES", "es-419"], "es-ES"],
  ])("matches navigator %j against %j as %s", async (languages, locales, expected) => {
    setNavigatorLocales(languages);
    const i18n = createI18n({
      defaultLocale: "en",
      locales,
      loadLocale: () => ({ greeting: "Hello" }),
      getLocaleDirection: () => "ltr",
    });

    await initializeBrowserI18n({ i18n, persistLocale: false });

    expect(i18n.locale).toBe(expected);
  });

  it.each([
    [["zh-TW"], ["en", "zh-Hans", "zh-Hant"], "zh-Hant"],
    [["zh-HK"], ["en", "zh-Hans", "zh-Hant"], "zh-Hant"],
    [["zh-CN"], ["en", "zh-Hant", "zh-Hans"], "zh-Hans"],
    [["zh-HK"], ["en", "zh-CN", "zh-TW"], "zh-TW"],
    [["zh-Hant-HK"], ["en", "zh-Hant-TW", "zh-Hant-HK"], "zh-Hant-HK"],
    [["sr"], ["en", "sr-Latn", "sr-Cyrl"], "sr-Cyrl"],
    [["zh-TW"], ["en", "zh", "zh-Hant"], "zh-Hant"],
    [["zh-HK"], ["en", "zh", "zh-TW"], "zh-TW"],
    [["en-GB"], ["en", "en-US"], "en"],
  ])("matches navigator %j by likely script against %j as %s", async (languages, locales, expected) => {
    setNavigatorLocales(languages);
    const i18n = createI18n({
      defaultLocale: "en",
      locales,
      loadLocale: () => ({ greeting: "Hello" }),
      getLocaleDirection: () => "ltr",
    });

    await initializeBrowserI18n({ i18n, persistLocale: false });

    expect(i18n.locale).toBe(expected);
  });

  it("uses navigator.language when the preference list is empty", async () => {
    setNavigatorLocales([], "fr-CA");
    const i18n = createManager();

    await initializeBrowserI18n({ i18n, persistLocale: false });

    expect(i18n.locale).toBe("fr");
  });

  it("falls back to the configured default locale", async () => {
    setNavigatorLocales(["de-DE"]);
    const i18n = createManager();

    await initializeBrowserI18n({ i18n, persistLocale: false });

    expect(i18n.locale).toBe("en");
  });

  it("rejects observation without a root before initializing core", async () => {
    const i18n = createManager();

    await expect(initializeBrowserI18n({ i18n, observe: true })).rejects.toBeInstanceOf(TypeError);
    expect(i18n.isReady).toBe(false);
  });

  it.each([null, 42])(
    "rejects authoritative invalid explicit locale %j without falling through and releases ownership",
    async (invalidLocale) => {
      localStorage.setItem("i18n", JSON.stringify({ locale: "fr" }));
      setNavigatorLocales(["fr"]);
      const getItem = vi.spyOn(Storage.prototype, "getItem");
      const i18n = createManager();

      await expect(initializeBrowserI18n({ i18n, locale: invalidLocale as unknown as Locale })).rejects.toBeInstanceOf(
        RangeError,
      );

      expect(getItem).not.toHaveBeenCalled();
      expect(i18n.isReady).toBe(false);

      const binding = await initializeBrowserI18n({ i18n, locale: "en" });
      expect(i18n.locale).toBe("en");
      binding.disconnect();
    },
  );
});

describe("initializeBrowserI18n storage integration", () => {
  it("continues after a storage read failure and warns", async () => {
    const failure = new Error("storage blocked");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw failure;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setNavigatorLocales(["fr"]);
    const i18n = createManager();

    await expect(initializeBrowserI18n({ i18n })).resolves.toBeDefined();

    expect(i18n.locale).toBe("fr");
    expect(warn).toHaveBeenCalledWith("[I18n] Could not read persisted locale.", failure);
  });

  it("continues after a storage write failure and suppresses warnings when silent", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage full");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = createManager({ isSilent: true });

    await expect(initializeBrowserI18n({ i18n, locale: "fr" })).resolves.toBeDefined();

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(i18n.isReady).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not persist a locale detected from navigator preferences", async () => {
    setNavigatorLocales(["en-US"]);
    const firstVisit = createManager();
    const firstBinding = await initializeBrowserI18n({ i18n: firstVisit });

    expect(firstVisit.locale).toBe("en");
    expect(localStorage.getItem("i18n")).toBeNull();
    firstBinding.disconnect();

    setNavigatorLocales(["fr-CA"]);
    const secondVisit = createManager();
    await initializeBrowserI18n({ i18n: secondVisit });

    expect(secondVisit.locale).toBe("fr");
  });

  it("falls back to the default without persisting it when a detected locale fails to load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setNavigatorLocales(["fr-CA"]);
    const i18n = createManager({
      loadLocale: (locale) => (locale === "fr" ? Promise.reject(new Error("503")) : dictionaries[locale]),
    });

    await initializeBrowserI18n({ i18n });

    expect(i18n.locale).toBe("en");
    expect(i18n.isReady).toBe(true);
    expect(localStorage.getItem("i18n")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"fr"'), expect.any(I18nError));
  });

  it("falls back to the default when a stored locale fails to load, keeping the stored choice", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.setItem("i18n", JSON.stringify({ locale: "fr" }));
    const i18n = createManager({
      loadLocale: (locale) => (locale === "fr" ? Promise.reject(new Error("503")) : dictionaries[locale]),
    });

    await initializeBrowserI18n({ i18n });

    expect(i18n.locale).toBe("en");
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "fr" }));
  });

  it("rejects when an explicit locale fails to load", async () => {
    const i18n = createManager({
      loadLocale: (locale) => (locale === "fr" ? Promise.reject(new Error("503")) : dictionaries[locale]),
    });

    await expect(initializeBrowserI18n({ i18n, locale: "fr" })).rejects.toBeInstanceOf(I18nError);
    expect(i18n.isReady).toBe(false);
  });

  it("rejects when a detected locale returns an invalid dictionary", async () => {
    setNavigatorLocales(["fr-CA"]);
    const i18n = createManager({
      loadLocale: (locale) => (locale === "fr" ? { greeting: 1 } : dictionaries[locale]),
    });

    await expect(initializeBrowserI18n({ i18n })).rejects.toBeInstanceOf(TypeError);
  });

  it("persists a locale chosen after detected initialization", async () => {
    setNavigatorLocales(["en-US"]);
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n });

    await i18n.setLocale("fr");

    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "fr" }));
    binding.disconnect();
  });

  it("does not read or write storage when persistence is disabled", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setNavigatorLocales(["fr"]);
    const i18n = createManager();

    await initializeBrowserI18n({ i18n, persistLocale: false });

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
