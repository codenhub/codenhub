import { describe, expect, it, vi } from "vitest";

import { initializeBrowserI18n } from "../browser";
import { createManager, type Locale, setNavigatorLocales, setupBrowserTestHooks } from "./browser-i18n-test-helpers";

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
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage full");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = createManager({ isSilent: true });

    await expect(initializeBrowserI18n({ i18n })).resolves.toBeDefined();

    expect(i18n.isReady).toBe(true);
    expect(warn).not.toHaveBeenCalled();
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
