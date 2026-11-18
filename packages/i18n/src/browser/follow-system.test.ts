import { afterEach, describe, expect, it, vi } from "vitest";

import { type BrowserI18nBinding, type BrowserI18nOptions, initializeBrowserI18n } from "../browser";
import { I18nError } from "../index";
import {
  createDeferred,
  createManager,
  dictionaries,
  type Locale,
  setNavigatorLocales,
  setupBrowserTestHooks,
} from "./test-helpers";

setupBrowserTestHooks();

// Each binding listens on the shared window, so one left connected would answer a later test's languagechange.
const bindings: BrowserI18nBinding[] = [];
const bind = async (options: BrowserI18nOptions<Locale>) => {
  const binding = await initializeBrowserI18n(options);
  bindings.push(binding);
  return binding;
};

afterEach(() => {
  for (const binding of bindings.splice(0)) {
    binding.disconnect();
  }
});

const changeLanguages = (languages: readonly string[]) => {
  setNavigatorLocales(languages);
  window.dispatchEvent(new Event("languagechange"));
};

const flushPromises = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe("initializeBrowserI18n followsSystem", () => {
  it("follows the system after a detected start", async () => {
    setNavigatorLocales(["fr-CA"]);
    const binding = await bind({ i18n: createManager() });

    expect(binding.followsSystem).toBe(true);
  });

  it("does not follow the system after a saved or an explicit start", async () => {
    localStorage.setItem("i18n", JSON.stringify({ locale: "fr" }));
    const saved = await bind({ i18n: createManager() });
    const explicit = await bind({ i18n: createManager(), locale: "ar", persistLocale: false });

    expect(saved.followsSystem).toBe(false);
    expect(explicit.followsSystem).toBe(false);
  });

  it("does not follow the system when a saved locale fails to load and falls back", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.setItem("i18n", JSON.stringify({ locale: "fr" }));
    const i18n = createManager({
      loadLocale: (locale) => (locale === "fr" ? Promise.reject(new Error("503")) : dictionaries[locale]),
    });

    const binding = await bind({ i18n });

    expect(binding.followsSystem).toBe(false);
  });

  it.each([true, false])("stops following the system after setLocale() with persistLocale %s", async (persist) => {
    setNavigatorLocales(["en-US"]);
    const i18n = createManager();
    const binding = await bind({ i18n, persistLocale: persist });

    await i18n.setLocale("fr");

    expect(binding.followsSystem).toBe(false);
  });

  it("saves a choice of the locale already detected", async () => {
    setNavigatorLocales(["en-US"]);
    const i18n = createManager();
    const binding = await bind({ i18n });

    await i18n.setLocale("en");

    expect(binding.followsSystem).toBe(false);
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "en" }));
  });

  it("stops following the system after init() on the bound manager", async () => {
    const i18n = createManager();
    const binding = await bind({ i18n });

    await i18n.init({ locale: "ar" });

    expect(binding.followsSystem).toBe(false);
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "ar" }));
  });
});

describe("initializeBrowserI18n followSystem()", () => {
  it("forgets the saved locale and switches to the detected one without saving it", async () => {
    localStorage.setItem("i18n", JSON.stringify({ locale: "fr" }));
    setNavigatorLocales(["pt-PT"]);
    const i18n = createManager();
    const binding = await bind({ i18n });

    await binding.followSystem();

    expect(i18n.locale).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(binding.followsSystem).toBe(true);
    expect(localStorage.getItem("i18n")).toBeNull();
  });

  it("forgets the saved locale when the detected locale is already active", async () => {
    setNavigatorLocales(["fr"]);
    const i18n = createManager();
    const binding = await bind({ i18n });
    await i18n.setLocale("fr");

    await binding.followSystem();

    expect(i18n.locale).toBe("fr");
    expect(binding.followsSystem).toBe(true);
    expect(localStorage.getItem("i18n")).toBeNull();
  });

  it("uses the default locale when no navigator preference matches", async () => {
    setNavigatorLocales(["de"]);
    const i18n = createManager();
    const binding = await bind({ i18n, locale: "fr" });

    await binding.followSystem();

    expect(i18n.locale).toBe("en");
    expect(localStorage.getItem("i18n")).toBeNull();
  });

  it("leaves storage alone when persistence is disabled", async () => {
    localStorage.setItem("i18n", JSON.stringify({ locale: "ar" }));
    setNavigatorLocales(["pt-BR"]);
    const i18n = createManager();
    const binding = await bind({ i18n, locale: "fr", persistLocale: false });

    await binding.followSystem();

    expect(i18n.locale).toBe("pt-BR");
    expect(binding.followsSystem).toBe(true);
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "ar" }));
  });

  it("warns and still switches when the saved locale cannot be removed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setNavigatorLocales(["pt-BR"]);
    const i18n = createManager();
    const binding = await bind({ i18n, locale: "fr" });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    await binding.followSystem();

    expect(i18n.locale).toBe("pt-BR");
    expect(warn).toHaveBeenCalledWith("[I18n] Could not forget persisted locale.", expect.any(Error));
  });

  it("rejects when the detected locale fails to load, keeping the active locale", async () => {
    setNavigatorLocales(["pt-BR"]);
    const i18n = createManager({
      loadLocale: (locale) => (locale === "pt-BR" ? Promise.reject(new Error("503")) : dictionaries[locale]),
    });
    const binding = await bind({ i18n, locale: "fr" });

    await expect(binding.followSystem()).rejects.toBeInstanceOf(I18nError);

    expect(i18n.locale).toBe("fr");
    expect(localStorage.getItem("i18n")).toBeNull();
  });

  it("resolves when a later setLocale() supersedes it, keeping the later choice", async () => {
    setNavigatorLocales(["pt-BR"]);
    const ptBr = createDeferred<unknown>();
    const i18n = createManager({
      loadLocale: (locale) => (locale === "pt-BR" ? ptBr.promise : dictionaries[locale]),
    });
    const binding = await bind({ i18n, locale: "fr" });

    const following = binding.followSystem();
    await i18n.setLocale("ar");
    ptBr.resolve(dictionaries["pt-BR"]);
    await following;

    expect(i18n.locale).toBe("ar");
    expect(binding.followsSystem).toBe(false);
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "ar" }));
  });

  it("rejects after disconnect()", async () => {
    const binding = await bind({ i18n: createManager() });
    binding.disconnect();

    await expect(binding.followSystem()).rejects.toThrow("requires a connected browser binding");
  });
});

describe("initializeBrowserI18n languagechange", () => {
  it("switches to the newly detected locale while following the system, without saving it", async () => {
    setNavigatorLocales(["en-US"]);
    const i18n = createManager();
    await bind({ i18n });

    changeLanguages(["fr-FR"]);
    await flushPromises();

    expect(i18n.locale).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(localStorage.getItem("i18n")).toBeNull();
  });

  it("ignores the event once a locale is chosen", async () => {
    const i18n = createManager();
    await bind({ i18n });
    await i18n.setLocale("ar");

    changeLanguages(["fr"]);
    await flushPromises();

    expect(i18n.locale).toBe("ar");
  });

  it("follows the event again after followSystem()", async () => {
    const i18n = createManager();
    const binding = await bind({ i18n, locale: "ar" });
    await binding.followSystem();

    changeLanguages(["pt-BR"]);
    await flushPromises();

    expect(i18n.locale).toBe("pt-BR");
  });

  it("warns and keeps the active locale when the detected locale fails to load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = createManager({
      loadLocale: (locale) => (locale === "fr" ? Promise.reject(new Error("503")) : dictionaries[locale]),
    });
    await bind({ i18n });

    changeLanguages(["fr"]);
    await flushPromises();

    expect(i18n.locale).toBe("en");
    expect(warn).toHaveBeenCalledWith("[I18n] Could not switch to the detected locale.", expect.any(I18nError));
  });

  it("does not apply a detected locale still loading at disconnect()", async () => {
    const fr = createDeferred<unknown>();
    const i18n = createManager({ loadLocale: (locale) => (locale === "fr" ? fr.promise : dictionaries[locale]) });
    const binding = await bind({ i18n });

    changeLanguages(["fr"]);
    binding.disconnect();
    fr.resolve(dictionaries.fr);
    await flushPromises();

    expect(i18n.locale).toBe("en");
  });

  it("keeps an application request still loading at disconnect()", async () => {
    const fr = createDeferred<unknown>();
    const i18n = createManager({ loadLocale: (locale) => (locale === "fr" ? fr.promise : dictionaries[locale]) });
    const binding = await bind({ i18n });

    const choosing = i18n.setLocale("fr");
    binding.disconnect();
    fr.resolve(dictionaries.fr);
    await choosing;

    expect(i18n.locale).toBe("fr");
  });

  it("switches to a language the browser changed to while the start was loading", async () => {
    const en = createDeferred<unknown>();
    let isFirstLoad = true;
    const i18n = createManager({
      loadLocale: (locale) => {
        if (locale === "en" && isFirstLoad) {
          isFirstLoad = false;
          return en.promise;
        }
        return dictionaries[locale];
      },
    });

    const starting = bind({ i18n });
    changeLanguages(["fr"]);
    en.resolve(dictionaries.en);
    await starting;
    await flushPromises();

    expect(i18n.locale).toBe("fr");
  });

  it("stops listening after disconnect()", async () => {
    const i18n = createManager();
    const binding = await bind({ i18n });
    binding.disconnect();

    changeLanguages(["fr"]);
    await flushPromises();

    expect(i18n.locale).toBe("en");
  });
});
