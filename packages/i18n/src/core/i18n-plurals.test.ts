// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createI18n } from "../index";

const dictionaries = {
  en: {
    cart: { items: { one: "{count} item", other: "{count} items" } },
    inbox: { other: "{count} messages" },
    title: "Cart",
  },
  pt: {
    cart: { items: { one: "{count} item", other: "{count} itens" } },
    title: "Carrinho",
  },
  ar: {
    cart: {
      items: {
        zero: "لا عناصر",
        one: "عنصر واحد",
        two: "عنصران",
        few: "{count} عناصر",
        many: "{count} عنصرًا",
        other: "{count} عنصر",
      },
    },
  },
} as const;

const createPluralI18n = (onMissingKey?: (key: string) => void) =>
  createI18n({
    defaultLocale: "en",
    locales: ["en", "pt", "ar"] as const,
    loadLocale: (locale) => dictionaries[locale],
    onMissingKey,
  });

describe("plural selection", () => {
  it("should pick the plural form for `count` with the active locale's rules", async () => {
    const i18n = createPluralI18n();
    await i18n.init();

    expect(i18n.t("cart.items", { count: 1 })).toBe("1 item");
    expect(i18n.t("cart.items", { count: 0 })).toBe("0 items");
    expect(i18n.t("cart.items", { count: 2 })).toBe("2 items");
  });

  it("should use every CLDR category the locale has", async () => {
    const i18n = createPluralI18n();
    await i18n.init({ locale: "ar" });

    expect([0, 1, 2, 3, 11, 100].map((count) => i18n.t("cart.items", { count }))).toEqual([
      "لا عناصر",
      "عنصر واحد",
      "عنصران",
      "3 عناصر",
      "11 عنصرًا",
      "100 عنصر",
    ]);
  });

  it("should fall back to `other` when the selected category is missing", async () => {
    const i18n = createPluralI18n();
    await i18n.init();

    expect(i18n.t("inbox", { count: 1 })).toBe("1 messages");
  });

  it("should fall back to the default dictionary with the default locale's rules", async () => {
    const i18n = createPluralI18n();
    await i18n.init({ locale: "pt" });

    // Portuguese puts 0 in `one`, unlike English.
    expect(i18n.t("cart.items", { count: 0 })).toBe("0 item");
    expect(i18n.t("cart.items", { count: 2 })).toBe("2 itens");
    expect(i18n.t("inbox", { count: 3 })).toBe("3 messages");
  });

  it("should prefer an exact key over plural forms", async () => {
    const i18n = createPluralI18n();
    await i18n.init();

    expect(i18n.t("title", { count: 2 })).toBe("Cart");
  });

  it("should report a plural group used without a numeric count as missing", async () => {
    const onMissingKey = vi.fn();
    const i18n = createPluralI18n(onMissingKey);
    await i18n.init();

    expect(i18n.t("cart.items")).toBe("cart.items");
    expect(i18n.t("cart.items", { count: "2" })).toBe("cart.items");
    expect(onMissingKey).toHaveBeenCalledTimes(2);
    expect(onMissingKey).toHaveBeenCalledWith("cart.items", "en");
  });

  it("should use `other` for a locale that `Intl.PluralRules` cannot read", async () => {
    const i18n = createI18n({
      defaultLocale: "x-test",
      locales: ["x-test"] as const,
      loadLocale: () => ({ items: { one: "one item", other: "{count} items" } }),
    });
    await i18n.init();

    expect(i18n.t("items", { count: 1 })).toBe("1 items");
  });

  it("should type a plural group as a key and keep its forms as keys", async () => {
    const i18n = createPluralI18n();
    await i18n.init();

    const keys = ["cart.items", "cart.items.one", "inbox", "title"] satisfies Parameters<typeof i18n.t>[0][];
    expect(keys).toHaveLength(4);
    // @ts-expect-error - a group without an `other` form is not a plural
    expect(i18n.t("cart", { count: 1 })).toBe("cart");
  });
});
