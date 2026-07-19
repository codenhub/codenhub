// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { createI18n, I18nError, i18nErrors, type I18n, type I18nConfig } from "./index";

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createI18n", () => {
  it("exposes isolated readonly metadata and deterministic initial state", () => {
    const locales: Locale[] = ["en", "pt", "ar"];
    const i18n = createI18n(createConfig({ locales }));
    locales.pop();

    expect(i18n.defaultLocale).toBe("en");
    expect(i18n.locales).toEqual(["en", "pt", "ar"]);
    expect(Object.isFrozen(i18n.locales)).toBe(true);
    expect(i18n.isSilent).toBe(false);
    expect(i18n.locale).toBe("en");
    expect(i18n.direction).toBe("ltr");
    expect(i18n.isReady).toBe(false);
  });

  it("exposes and loads trimmed canonical configured locales", async () => {
    const loadLocale = vi.fn(() => ({ key: "value" }));
    const config: I18nConfig<string> = {
      defaultLocale: " EN ",
      locales: [" en ", " pt "],
      loadLocale,
      getLocaleDirection: () => "ltr",
    };
    const i18n = createI18n(config);

    expect(i18n.defaultLocale).toBe("en");
    expect(i18n.locales).toEqual(["en", "pt"]);
    await i18n.init({ locale: " PT " });
    expect(i18n.locale).toBe("pt");
    expect(loadLocale).toHaveBeenCalledWith("pt");
    expect(loadLocale).toHaveBeenCalledWith("en");
  });

  it("throws native programmer errors for state-dependent calls before init", async () => {
    const i18n = createI18n(createConfig());

    expect(() => i18n.translate("common.greeting")).toThrow(Error);
    await expect(i18n.setLocale("pt")).rejects.toBeInstanceOf(Error);
  });

  it("resolves canonical locales without language-subtag matching", () => {
    const i18n = createI18n(createConfig());

    expect(i18n.resolveLocale(" PT ")).toBe("pt");
    expect(i18n.resolveLocale("pt-BR")).toBeUndefined();
    expect(i18n.resolveLocale(" ")).toBeUndefined();
  });

  it("loads a public dictionary without changing active state", async () => {
    const i18n = createI18n(createConfig());
    const { onReady, onLocaleChange } = listenForLifecycleEvents(i18n);

    await expect(i18n.loadLocale("PT" as Locale)).resolves.toEqual({ "common.greeting": "Ola" });
    expect(i18n.locale).toBe("en");
    expect(i18n.isReady).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
    expect(onLocaleChange).not.toHaveBeenCalled();
  });

  it("does not emit when a public locale load fails", async () => {
    const i18n = createI18n(createConfig({ loadLocale: vi.fn().mockRejectedValue(new Error("offline")) }));
    const { onReady, onLocaleChange } = listenForLifecycleEvents(i18n);

    await expect(i18n.loadLocale("pt")).rejects.toBeInstanceOf(I18nError);
    expect(onReady).not.toHaveBeenCalled();
    expect(onLocaleChange).not.toHaveBeenCalled();
  });

  it("rejects unsupported locale operations with RangeError", async () => {
    const i18n = createI18n(createConfig());

    await expect(i18n.loadLocale("fr" as Locale)).rejects.toBeInstanceOf(RangeError);
    await expect(i18n.init({ locale: "fr" as Locale })).rejects.toBeInstanceOf(RangeError);
  });

  it("treats only undefined init locale as omitted", async () => {
    const i18n = createI18n(createConfig());

    await expect(i18n.init({ locale: undefined })).resolves.toBeUndefined();
    expect(i18n.locale).toBe("en");
  });

  it.each([null, 1, {}, true])("rejects an explicit invalid init locale %s with RangeError", async (locale) => {
    const i18n = createI18n(createConfig());

    await expect(i18n.init({ locale: locale as unknown as Locale })).rejects.toBeInstanceOf(RangeError);
    expect(i18n.isReady).toBe(false);
  });

  it("initializes the default locale and emits ready after applying state", async () => {
    const i18n = createI18n(createConfig());
    const listener = vi.fn();
    i18n.addEventListener("ready", listener);
    await i18n.init();

    expect(i18n.isReady).toBe(true);
    expect(i18n.translate(" common.greeting ")).toBe("Hello");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ detail: { locale: "en" }, target: i18n });
  });

  it("uses native CustomEvent when the runtime provides it", async () => {
    class NativeCustomEvent<TDetail> extends Event {
      readonly detail: TDetail;

      constructor(type: string, init: CustomEventInit<TDetail> = {}) {
        super(type, init);
        this.detail = init.detail as TDetail;
      }

      initCustomEvent(): void {}
    }

    vi.stubGlobal("CustomEvent", NativeCustomEvent);
    const i18n = createI18n(createConfig());
    const listener = vi.fn(function (this: unknown, _event: CustomEvent<{ locale: Locale }>) {
      expect(this).toBe(i18n);
    });
    i18n.addEventListener("ready", listener);
    await i18n.init();

    const event = listener.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(NativeCustomEvent);
    expect(event).toMatchObject({ detail: { locale: "en" }, target: i18n });
  });

  it("uses a structurally compatible CustomEvent fallback when unavailable", async () => {
    vi.stubGlobal("CustomEvent", undefined);
    const i18n = createI18n(createConfig());
    const listener = vi.fn(function (this: unknown, _event: CustomEvent<{ locale: Locale }>) {
      expect(this).toBe(i18n);
    });
    i18n.addEventListener("ready", listener);
    await i18n.init();

    const event = listener.mock.calls[0]?.[0] as CustomEvent<{ locale: Locale }>;
    expect(event).toBeInstanceOf(Event);
    expect(event).toMatchObject({
      type: "ready",
      detail: { locale: "en" },
      bubbles: false,
      cancelable: false,
      composed: false,
      target: i18n,
    });
    expect(event.initCustomEvent).toBeTypeOf("function");
  });

  it("does not read browser globals", async () => {
    const browserGlobals = ["window", "document", "navigator", "localStorage", "MutationObserver"] as const;
    const descriptors = new Map(
      browserGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
    );

    try {
      for (const name of browserGlobals) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          get() {
            throw new Error(`Core read ${name}`);
          },
        });
      }

      const i18n = createI18n(createConfig());
      await i18n.init({ locale: "pt" });
      expect(i18n.translate("common.greeting")).toBe("Ola");
    } finally {
      for (const name of browserGlobals) {
        const descriptor = descriptors.get(name);
        if (descriptor === undefined) {
          Reflect.deleteProperty(globalThis, name);
        } else {
          Object.defineProperty(globalThis, name, descriptor);
        }
      }
    }
  });

  it("exports the operational error mapping from the core entrypoint", () => {
    expect(i18nErrors.locale_load_failed.source).toBe("i18n.loader");
  });
});
