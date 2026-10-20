// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createI18n, type TranslationKey } from "../index";

const dictionaries = {
  en: { greeting: "Hello, {name}!", cart: { count: "{count} items for {name}" }, plain: "Plain {text}" },
  pt: { greeting: "Olá, {name}!" },
} as const;

const createTypedI18n = (overrides: { onMissingKey?: (key: string, locale: "en" | "pt") => void } = {}) =>
  createI18n({
    defaultLocale: "en",
    locales: ["en", "pt"] as const,
    loadLocale: (locale) => dictionaries[locale],
    isSilent: true,
    ...overrides,
  });

describe("interpolation", () => {
  it("should replace named placeholders with string and number params", async () => {
    const i18n = createTypedI18n();
    await i18n.init({ locale: "pt" });

    expect(i18n.t("greeting", { name: "Ana" })).toBe("Olá, Ana!");
    expect(i18n.t("cart.count", { count: 3, name: "Ana" })).toBe("3 items for Ana");
  });

  it("should leave placeholders without a matching param unchanged", async () => {
    const i18n = createTypedI18n();
    await i18n.init();

    expect(i18n.t("cart.count", { count: 3 })).toBe("3 items for {name}");
    expect(i18n.t("plain")).toBe("Plain {text}");
  });

  it("should ignore inherited params", async () => {
    const i18n = createTypedI18n();
    await i18n.init();
    const params = Object.create({ name: "Inherited" }) as Record<string, string>;

    expect(i18n.t("greeting", params)).toBe("Hello, {name}!");
  });
});

describe("missing keys", () => {
  it("should return the key and type the result as a string", async () => {
    const i18n = createTypedI18n();
    await i18n.init();
    const key = "absent.key" as TranslationKey<typeof dictionaries.en>;
    const text: string = i18n.t(key);

    expect(text).toBe("absent.key");
  });

  it("should report every miss through onMissingKey instead of warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onMissingKey = vi.fn();
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en", "pt"] as const,
      loadLocale: (): unknown => ({}),
      onMissingKey,
    });
    await i18n.init({ locale: "pt" });

    i18n.t("missing");
    i18n.t(" missing ");

    expect(onMissingKey.mock.calls).toEqual([
      ["missing", "pt"],
      ["missing", "pt"],
    ]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("should let onMissingKey fail the lookup by throwing", async () => {
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en"] as const,
      loadLocale: (): unknown => ({}),
      onMissingKey: (key) => {
        throw new Error(`Missing ${key}`);
      },
    });
    await i18n.init();

    expect(() => i18n.t("absent")).toThrow("Missing absent");
  });

  it("should reject a non-function onMissingKey", () => {
    expect(() =>
      createI18n({
        defaultLocale: "en",
        locales: ["en"],
        loadLocale: () => ({}),
        onMissingKey: "warn" as unknown as () => void,
      }),
    ).toThrow("onMissingKey: Must be a function");
  });
});

describe("matchLocale", () => {
  const createManager = (locales: readonly string[]) =>
    createI18n({ defaultLocale: locales[0] ?? "en", locales, loadLocale: () => ({}) });

  it("should match regional and script preferences to configured locales", () => {
    expect(createManager(["en", "pt"]).matchLocale(["pt-BR", "en"])).toBe("pt");
    expect(createManager(["en", "zh-Hans", "zh-Hant"]).matchLocale(["zh-TW"])).toBe("zh-Hant");
    expect(createManager(["en", "pt-BR"]).matchLocale(["PT"])).toBe("pt-BR");
  });

  it("should honor preference order and return undefined without a match", () => {
    const i18n = createManager(["en", "fr", "de"]);

    expect(i18n.matchLocale(["ja", "de-AT", "fr"])).toBe("de");
    expect(i18n.matchLocale(["ja", "ko"])).toBeUndefined();
    expect(i18n.matchLocale([])).toBeUndefined();
  });

  it("should skip malformed and non-string preferences", () => {
    const i18n = createManager(["en", "pt"]);

    expect(i18n.matchLocale(["", "@@", 42 as unknown as string, "pt"])).toBe("pt");
  });

  it("should reject a non-array input", () => {
    const i18n = createManager(["en"]);

    expect(() => i18n.matchLocale("en" as unknown as string[])).toThrow(TypeError);
  });
});

describe("default direction", () => {
  it("should resolve rtl for right-to-left languages and scripts", () => {
    const locales = ["en", "ar-EG", "he", "fa", "ur", "uz-Arab", "ar-Latn"];
    const directions = locales.map(
      (locale) => createI18n({ defaultLocale: locale, locales: [locale], loadLocale: () => ({}) }).direction,
    );

    expect(directions).toEqual(["ltr", "rtl", "rtl", "rtl", "rtl", "rtl", "ltr"]);
  });

  it("should apply the default direction when the locale changes", async () => {
    const i18n = createI18n({ defaultLocale: "en", locales: ["en", "ar"], loadLocale: () => ({}) });

    await i18n.init({ locale: "ar" });

    expect(i18n.direction).toBe("rtl");
  });
});

describe("subscribe", () => {
  it("should notify after applied initialization and locale changes until unsubscribed", async () => {
    const i18n = createTypedI18n();
    const listener = vi.fn();
    const unsubscribe = i18n.subscribe(listener);

    await i18n.init();
    await i18n.setLocale("pt");
    await i18n.setLocale("pt");
    unsubscribe();
    unsubscribe();
    await i18n.setLocale("en");

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0]).toEqual([]);
  });

  it("should work detached from the manager", async () => {
    const { init, subscribe } = createTypedI18n();
    const listener = vi.fn();
    subscribe(listener);

    await init();

    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("init", () => {
  it("should resolve without a value", async () => {
    const i18n = createTypedI18n();

    await expect(i18n.init()).resolves.toBeUndefined();
  });
});
