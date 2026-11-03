// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createI18n, I18nError } from "../index";

const dictionaries: Record<string, Record<string, unknown>> = {
  en: { hello: "Hello", bye: "Bye", only: "Only English", items: { one: "{count} item", other: "{count} items" } },
  pt: { hello: "Olá", bye: "Tchau", items: { one: "{count} item", other: "{count} itens" } },
  "pt-BR": { hello: "Oi" },
  zh: { hello: "你好", bye: "再见" },
  "zh-Hant": { hello: "妳好" },
  "zh-Hant-TW": {},
};

const create = (locales: readonly string[], loadLocale = (locale: string): unknown => dictionaries[locale]) =>
  createI18n({ defaultLocale: "en", locales, loadLocale, isSilent: true });

describe("regional fallback", () => {
  it("should fall back to a configured parent locale before the default", async () => {
    const i18n = create(["en", "pt", "pt-BR"]);
    await i18n.init({ locale: "pt-BR" });

    expect(i18n.t("hello")).toBe("Oi");
    expect(i18n.t("bye")).toBe("Tchau");
    expect(i18n.t("only")).toBe("Only English");
  });

  it("should use the plural rules of the dictionary that has the group", async () => {
    const i18n = create(["en", "pt", "pt-BR"]);
    await i18n.init({ locale: "pt-BR" });

    // Brazilian Portuguese puts 0 in `one`, as `pt` does.
    expect(i18n.t("items", { count: 0 })).toBe("0 item");
    expect(i18n.t("items", { count: 2 })).toBe("2 itens");
  });

  it("should skip a parent written in another script", async () => {
    const i18n = create(["en", "zh", "zh-Hant", "zh-Hant-TW"]);
    await i18n.init({ locale: "zh-Hant-TW" });

    expect(i18n.t("hello")).toBe("妳好");
    // `zh` is Simplified Chinese, so a Traditional page falls back to English rather than mixing scripts.
    expect(i18n.t("bye")).toBe("Bye");
  });

  it("should load the whole chain together and not load an unrelated locale", async () => {
    const loadLocale = vi.fn((locale: string) => dictionaries[locale]!);
    const i18n = create(["en", "pt", "pt-BR", "zh"], loadLocale);
    await i18n.init({ locale: "pt-BR" });

    expect(loadLocale.mock.calls.map(([locale]) => locale).sort()).toEqual(["en", "pt", "pt-BR"]);
  });

  it("should fall back to the default when no parent is configured", async () => {
    const i18n = create(["en", "pt-BR"]);
    await i18n.init({ locale: "pt-BR" });

    expect(i18n.t("bye")).toBe("Bye");
  });

  it("should reject when a parent locale fails to load, keeping the current state", async () => {
    const i18n = create(["en", "pt", "pt-BR"], (locale) => {
      if (locale === "pt") {
        throw new Error("offline");
      }
      return dictionaries[locale]!;
    });
    await i18n.init();

    await expect(i18n.setLocale("pt-BR")).rejects.toThrow(I18nError);
    expect(i18n.locale).toBe("en");
  });

  it("should report a key missing from every dictionary in the chain once, with the active locale", async () => {
    const onMissingKey = vi.fn();
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en", "pt", "pt-BR"],
      loadLocale: (locale): unknown => dictionaries[locale],
      onMissingKey,
    });
    await i18n.init({ locale: "pt-BR" });

    expect(i18n.t("nowhere")).toBe("nowhere");
    expect(onMissingKey).toHaveBeenCalledTimes(1);
    expect(onMissingKey).toHaveBeenCalledWith("nowhere", "pt-BR");
  });
});
