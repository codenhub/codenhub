import { describe, expect, it, vi } from "vitest";

import { type BrowserLocaleStorage, initializeBrowserI18n } from "../browser";
import { createI18n, I18nError } from "../index";
import {
  createDeferred,
  createManager,
  dictionaries,
  type Locale,
  setNavigatorLocales,
  setupBrowserTestHooks,
} from "./test-helpers";

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

  it.each([
    { root: null, observe: false },
    { root: null, observe: true },
    { root: "#app", observe: false },
    { root: document.createTextNode("text"), observe: false },
    { root: document.createComment("comment"), observe: true },
  ])(
    "rejects a root that is not a parent node, $root with observe $observe, before initializing core",
    async (options) => {
      const i18n = createManager();

      await expect(
        initializeBrowserI18n({
          i18n,
          locale: "fr",
          ...(options as unknown as { root: ParentNode; observe: boolean }),
        }),
      ).rejects.toThrow(
        new TypeError("[I18n] root must be an element, a document, or a shadow root, such as document.body."),
      );
      expect(i18n.isReady).toBe(false);
      expect(localStorage.getItem("i18n")).toBeNull();
      expect(document.documentElement.lang).toBe("");
    },
  );

  it("rejects document synchronization without a page document before initializing core", async () => {
    const i18n = createManager();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document")!;
    Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });

    try {
      await expect(initializeBrowserI18n({ i18n, locale: "fr", persistLocale: false })).rejects.toThrow(
        new TypeError(
          "[I18n] Document synchronization requires a page document; pass syncDocument: false without one.",
        ),
      );
    } finally {
      Object.defineProperty(globalThis, "document", descriptor);
    }
    expect(i18n.isReady).toBe(false);
  });

  it("rejects a second start for the same manager with a TypeError", async () => {
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, persistLocale: false });

    const second = initializeBrowserI18n({ i18n, persistLocale: false });

    expect(second).toBeInstanceOf(Promise);
    await expect(second).rejects.toThrow(new TypeError("[I18n] The manager already has a browser binding."));
    binding.disconnect();
  });

  it("rejects without a global event target before initializing core", async () => {
    const i18n = createManager();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "addEventListener");
    Object.defineProperty(globalThis, "addEventListener", { value: undefined, configurable: true });

    try {
      await expect(
        initializeBrowserI18n({ i18n, locale: "fr", persistLocale: false, syncDocument: false }),
      ).rejects.toThrow(
        new TypeError("[I18n] The browser binding requires a global event target, such as window or a worker's self."),
      );
    } finally {
      if (descriptor === undefined) {
        delete (globalThis as { addEventListener?: unknown }).addEventListener;
      } else {
        Object.defineProperty(globalThis, "addEventListener", descriptor);
      }
    }
    expect(i18n.isReady).toBe(false);
  });

  it("initializes without a page document when document synchronization is disabled", async () => {
    const i18n = createManager();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document")!;
    Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });

    try {
      await initializeBrowserI18n({ i18n, locale: "fr", persistLocale: false, syncDocument: false });
    } finally {
      Object.defineProperty(globalThis, "document", descriptor);
    }
    expect(i18n.locale).toBe("fr");
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

  it("does not compile an explicit locale the manager does not support", async () => {
    const i18n = createManager();

    await expect(
      initializeBrowserI18n({
        i18n,
        // @ts-expect-error -- "xx" is not a configured locale, so it must not widen the manager's locales.
        locale: "xx",
      }),
    ).rejects.toBeInstanceOf(RangeError);
  });
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

  it("continues when reading the localStorage property itself throws, as with site data blocked", async () => {
    const failure = new DOMException("The operation is insecure.", "SecurityError");
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw failure;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setNavigatorLocales(["fr"]);
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n });
    await i18n.setLocale("ar");

    expect(i18n.locale).toBe("ar");
    expect(warn).toHaveBeenCalledWith("[I18n] Could not read persisted locale.", failure);
    expect(warn).toHaveBeenCalledWith("[I18n] Could not persist locale.", failure);
    binding.disconnect();
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

  it("warns and ignores a persisted value that is not valid JSON", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.setItem("i18n", "{bad");
    setNavigatorLocales(["fr"]);
    const i18n = createManager();

    await initializeBrowserI18n({ i18n });

    expect(i18n.locale).toBe("fr");
    expect(warn).toHaveBeenCalledWith("[I18n] Could not read persisted locale.", expect.any(SyntaxError));
  });

  it.each([
    ["a bare JSON string", '"fr"'],
    ["null", "null"],
    ["a number", "42"],
    ["an object without a string locale", '{"locale":{"toString":1}}'],
    ["a locale that is no longer configured", '{"locale":"de"}'],
  ])("ignores a persisted value that is %s", async (_description, storedValue) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.setItem("i18n", storedValue);
    setNavigatorLocales(["pt-BR"]);
    const i18n = createManager();

    await initializeBrowserI18n({ i18n });

    expect(i18n.locale).toBe("pt-BR");
    expect(warn).not.toHaveBeenCalled();
  });

  it("resolves a persisted locale with surrounding whitespace and different case", async () => {
    localStorage.setItem("i18n", JSON.stringify({ locale: " FR " }));
    const i18n = createManager();

    await initializeBrowserI18n({ i18n });

    expect(i18n.locale).toBe("fr");
  });

  it("matches a persisted locale the application no longer configures, keeping the stored value", async () => {
    localStorage.setItem("i18n", JSON.stringify({ locale: "pt-PT" }));
    setNavigatorLocales(["en-US"]);
    const i18n = createManager();

    await initializeBrowserI18n({ i18n });

    expect(i18n.locale).toBe("pt-BR");
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "pt-PT" }));
  });

  it("falls back to navigator preferences when a persisted locale matches nothing", async () => {
    localStorage.setItem("i18n", JSON.stringify({ locale: "de" }));
    setNavigatorLocales(["fr-CA"]);
    const i18n = createManager();

    await initializeBrowserI18n({ i18n });

    expect(i18n.locale).toBe("fr");
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

  it("tries the detected locale when a stored locale fails to load, keeping the stored choice", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.setItem("i18n", JSON.stringify({ locale: "fr" }));
    setNavigatorLocales(["pt-BR"]);
    const i18n = createManager({
      loadLocale: (locale) => (locale === "fr" ? Promise.reject(new Error("503")) : dictionaries[locale]),
    });

    await initializeBrowserI18n({ i18n });

    expect(i18n.locale).toBe("pt-BR");
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "fr" }));
    expect(warn).toHaveBeenCalledWith('[I18n] Could not load locale "fr"; using "pt-BR".', expect.any(I18nError));
  });

  it("falls back to the default when a parent shared by the stored and the detected locale fails to load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.setItem("i18n", JSON.stringify({ locale: "pt-BR" }));
    setNavigatorLocales(["pt"]);
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en", "pt", "pt-BR"],
      loadLocale: (locale) => (locale === "pt" ? Promise.reject(new Error("503")) : { greeting: locale }),
    });

    await initializeBrowserI18n({ i18n });

    expect(i18n.locale).toBe("en");
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "pt-BR" }));
    const parentFailure = expect.objectContaining({ locale: "pt" });
    expect(warn).toHaveBeenCalledWith('[I18n] Could not load locale "pt-BR"; using "pt".', parentFailure);
    expect(warn).toHaveBeenCalledWith('[I18n] Could not load locale "pt"; using the default locale.', parentFailure);
  });

  it("does not retry over a later init() when a stored locale fails to load after it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.setItem("i18n", JSON.stringify({ locale: "fr" }));
    let rejectFr: (error: Error) => void = () => undefined;
    const frLoad = new Promise<never>((_, reject) => {
      rejectFr = reject;
    });
    const i18n = createManager({ loadLocale: (locale) => (locale === "fr" ? frLoad : dictionaries[locale]) });

    const browserInitialization = initializeBrowserI18n({ i18n });
    const coreInitialization = i18n.init({ locale: "pt-BR" });
    rejectFr(new Error("503"));

    await expect(browserInitialization).rejects.toThrow("Browser initialization was superseded");
    await coreInitialization;
    expect(i18n.locale).toBe("pt-BR");
  });

  it("falls back to the default when both the stored and the detected locale fail to load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.setItem("i18n", JSON.stringify({ locale: "fr" }));
    setNavigatorLocales(["pt-BR"]);
    const i18n = createManager({
      loadLocale: (locale) => (locale === "en" ? dictionaries[locale] : Promise.reject(new Error("503"))),
    });

    await initializeBrowserI18n({ i18n });

    expect(i18n.locale).toBe("en");
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "fr" }));
    expect(warn).toHaveBeenCalledWith('[I18n] Could not load locale "fr"; using "pt-BR".', expect.any(I18nError));
    expect(warn).toHaveBeenCalledWith(
      '[I18n] Could not load locale "pt-BR"; using the default locale.',
      expect.any(I18nError),
    );
  });

  it("rejects without falling back when the default locale fails to load beside a detected locale", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setNavigatorLocales(["fr-CA"]);
    const i18n = createManager({
      loadLocale: (locale) => (locale === "en" ? Promise.reject(new Error("503")) : dictionaries[locale]),
    });

    await expect(initializeBrowserI18n({ i18n })).rejects.toMatchObject({ name: "I18nError", locale: "en" });
    expect(warn).not.toHaveBeenCalled();
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

describe("initializeBrowserI18n storage option", () => {
  // A store holding one plain locale string, as a cookie does, recording each call.
  const createStore = (initial?: unknown) => {
    let value = initial;
    const calls: string[] = [];
    const storage = {
      get: vi.fn(() => {
        calls.push("get");
        return value as string | undefined;
      }),
      set: vi.fn((locale: string) => {
        calls.push(`set ${locale}`);
        value = locale;
      }),
      remove: vi.fn(() => {
        calls.push("remove");
        value = undefined;
      }),
    };
    return { storage, calls, read: () => value };
  };

  it("starts in the stored locale before navigator preferences, without writing it back", async () => {
    const { storage, calls } = createStore("fr");
    setNavigatorLocales(["pt-BR"]);
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, storage });

    expect(i18n.locale).toBe("fr");
    expect(binding.isUsingSystemLocale).toBe(false);
    expect(calls).toEqual(["get"]);
    binding.disconnect();
  });

  it("matches a stored locale the application no longer lists exactly, keeping the stored value", async () => {
    const { storage, read } = createStore("pt-PT");
    setNavigatorLocales(["en-US"]);
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, storage });

    expect(i18n.locale).toBe("pt-BR");
    expect(read()).toBe("pt-PT");
    binding.disconnect();
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", { locale: "fr" }],
    ["a promise", Promise.resolve("fr")],
    ["an empty string", ""],
    ["a value that is not a language tag", "fr;"],
    ["a locale that matches nothing configured", "de"],
  ])("treats a get() that returns %s as nothing stored", async (_description, stored) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { storage } = createStore(stored);
    setNavigatorLocales(["pt-BR"]);
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, storage });

    expect(i18n.locale).toBe("pt-BR");
    expect(binding.isUsingSystemLocale).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    binding.disconnect();
  });

  it("writes an explicit locale and each applied choice as plain locale strings, but not a detected one", async () => {
    const { storage, calls } = createStore();
    setNavigatorLocales(["fr"]);
    const detected = createManager();
    const detectedBinding = await initializeBrowserI18n({ i18n: detected, storage });
    detectedBinding.disconnect();
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, storage, locale: "ar" });
    await i18n.setLocale("pt-BR");
    await i18n.setLocale("pt-BR");
    await i18n.init({ locale: "en" });

    expect(calls).toEqual(["get", "set ar", "set pt-BR", "set pt-BR", "set en"]);
    binding.disconnect();
  });

  it("forgets the stored locale through remove() when switching to the system locale", async () => {
    const { storage, calls, read } = createStore("ar");
    setNavigatorLocales(["fr"]);
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, storage });

    await binding.switchToSystemLocale();

    expect(i18n.locale).toBe("fr");
    expect(binding.isUsingSystemLocale).toBe(true);
    expect(read()).toBeUndefined();
    expect(calls).toEqual(["get", "remove"]);
    binding.disconnect();
  });

  it("falls back to the detected locale when the stored locale fails to load, keeping the stored choice", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { storage, calls } = createStore("ar");
    setNavigatorLocales(["fr"]);
    const i18n = createManager({
      loadLocale: (locale) => (locale === "ar" ? Promise.reject(new Error("offline")) : dictionaries[locale]),
    });

    const binding = await initializeBrowserI18n({ i18n, storage });

    expect(i18n.locale).toBe("fr");
    expect(binding.isUsingSystemLocale).toBe(false);
    expect(calls).toEqual(["get"]);
    binding.disconnect();
  });

  it("warns and carries on when each method throws", async () => {
    const failure = new Error("cookies blocked");
    const fail = () => {
      throw failure;
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setNavigatorLocales(["fr"]);
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, storage: { get: fail, set: fail, remove: fail } });
    await i18n.setLocale("ar");
    await binding.switchToSystemLocale();

    expect(i18n.locale).toBe("fr");
    expect(warn.mock.calls).toEqual([
      ["[I18n] Could not read persisted locale.", failure],
      ["[I18n] Could not persist locale.", failure],
      ["[I18n] Could not forget persisted locale.", failure],
    ]);
    binding.disconnect();
  });

  it("does not warn about a throwing method when the manager is silent", async () => {
    const fail = () => {
      throw new Error("cookies blocked");
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = createManager({ isSilent: true });

    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      storage: { get: fail, set: fail, remove: fail },
    });

    expect(warn).not.toHaveBeenCalled();
    binding.disconnect();
  });

  it("calls each method on the store, so a class instance works", async () => {
    class CookieStore {
      #value: string | undefined = "fr";
      get() {
        return this.#value;
      }
      set(locale: string) {
        this.#value = locale;
      }
      remove() {
        this.#value = undefined;
      }
    }
    const storage = new CookieStore();
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, storage });
    await i18n.setLocale("ar");

    expect(storage.get()).toBe("ar");
    binding.disconnect();
  });

  it("leaves localStorage alone", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const { storage } = createStore();
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, locale: "fr", storage });
    await binding.switchToSystemLocale();

    expect([getItem, setItem, removeItem].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
    binding.disconnect();
  });

  it("accepts storageKey and persistLocale left undefined beside it", async () => {
    const { storage, calls } = createStore();
    const i18n = createManager();

    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      storage,
      storageKey: undefined,
      persistLocale: undefined,
    });

    expect(calls).toEqual(["set fr"]);
    binding.disconnect();
  });

  it.each([
    ["storageKey", { storageKey: "locale" }, "[I18n] storage replaces storageKey; pass only one of them."],
    [
      "persistLocale: false",
      { persistLocale: false },
      "[I18n] storage requires persistLocale; drop storage or persistLocale: false.",
    ],
    ["persistLocale: true", { persistLocale: true }, undefined],
  ])("rejects storage beside %s before initializing the manager", async (_description, extra, message) => {
    const { storage } = createStore();
    const i18n = createManager();

    const start = initializeBrowserI18n({ i18n, locale: "fr", storage, ...extra });

    if (message === undefined) {
      (await start).disconnect();
      return;
    }
    await expect(start).rejects.toThrow(new TypeError(message));
    expect(i18n.isReady).toBe(false);
    expect(storage.get).not.toHaveBeenCalled();
    (await initializeBrowserI18n({ i18n, locale: "fr", storage })).disconnect();
  });

  it.each([
    ["null", null],
    ["a string", "cookie"],
    ["an object without get()", { set() {}, remove() {} }],
    ["an object without set()", { get: (): undefined => undefined, remove() {} }],
    ["an object without remove()", { get: (): undefined => undefined, set() {} }],
    ["an object whose get is not a function", { get: "fr", set() {}, remove() {} }],
  ])("rejects a storage that is %s before initializing the manager", async (_description, storage) => {
    const i18n = createManager();

    await expect(initializeBrowserI18n({ i18n, storage: storage as unknown as BrowserLocaleStorage })).rejects.toThrow(
      new TypeError("[I18n] storage must be an object with get(), set(), and remove() methods."),
    );
    expect(i18n.isReady).toBe(false);
  });
});

describe("the language picker in the browser guide", () => {
  // The guide's picker, as `docs/browser.md` writes it under "Let visitors switch languages".
  const startPicker = async (i18n: ReturnType<typeof createManager>) => {
    document.body.innerHTML =
      '<select id="language"><option>en</option><option>fr</option><option>ar</option></select>';
    const binding = await initializeBrowserI18n({ i18n, persistLocale: false });
    const picker = document.querySelector<HTMLSelectElement>("#language")!;
    const showLanguage = () => {
      picker.value = i18n.locale;
    };
    let latestPick = 0;

    showLanguage();
    binding.subscribe(showLanguage);
    const onChange = async () => {
      const pick = ++latestPick;
      try {
        await i18n.setLocale(picker.value as (typeof i18n.locales)[number]);
      } finally {
        if (pick === latestPick) {
          showLanguage();
        }
      }
    };
    const choose = (value: string) => {
      picker.value = value;
      return onChange();
    };
    return { binding, picker, choose };
  };

  it("shows the language in use when the chosen one fails to load", async () => {
    const i18n = createManager({
      loadLocale: (locale) => (locale === "fr" ? Promise.reject(new Error("offline")) : dictionaries[locale]),
    });
    const { binding, picker, choose } = await startPicker(i18n);

    await expect(choose("fr")).rejects.toThrow(I18nError);

    expect(i18n.locale).toBe("en");
    expect(picker.value).toBe("en");
    binding.disconnect();
  });

  it("shows the chosen language once it loads", async () => {
    const { binding, picker, choose } = await startPicker(createManager());

    await choose("fr");

    expect(picker.value).toBe("fr");
    binding.disconnect();
  });

  it("keeps the latest pick while it loads after an earlier one settles", async () => {
    const loads = { fr: createDeferred<unknown>(), ar: createDeferred<unknown>() };
    const i18n = createManager({
      loadLocale: (locale) => (locale === "fr" || locale === "ar" ? loads[locale].promise : dictionaries[locale]),
    });
    const { binding, picker, choose } = await startPicker(i18n);

    const french = choose("fr");
    const arabic = choose("ar");
    loads.fr.resolve(dictionaries.fr);
    await french;

    expect(picker.value).toBe("ar");
    loads.ar.resolve(dictionaries.ar);
    await arabic;
    expect(picker.value).toBe("ar");
    binding.disconnect();
  });

  it("shows a language the binding switches to after the browser's language changes", async () => {
    const { binding, picker } = await startPicker(createManager());

    setNavigatorLocales(["fr"]);
    window.dispatchEvent(new Event("languagechange"));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(picker.value).toBe("fr");
    binding.disconnect();
  });
});
