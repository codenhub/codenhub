// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createI18n, type I18n } from "../index";

const dictionaries = {
  en: { home: { title: "Welcome", intro: "Start here" }, footer: "Bye" },
  pt: { home: { title: "Bem-vindo" } },
} as const;

const createTypedI18n = () =>
  createI18n({
    defaultLocale: "en",
    locales: ["en", "pt"] as const,
    loadLocale: (locale) => dictionaries[locale],
    getLocaleDirection: () => "ltr",
    isSilent: true,
  });

describe("bound methods", () => {
  it("should translate through a destructured t", async () => {
    const i18n = createTypedI18n();
    const { t } = i18n;

    await i18n.init({ locale: "pt" });

    expect(t("home.title")).toBe("Bem-vindo");
    expect(t("home.intro")).toBe("Start here");
  });

  it("should expose t as the same function as translate", () => {
    const i18n = createTypedI18n();

    expect(i18n.t).toBe(i18n.translate);
  });

  it("should keep every method working when detached from the manager", async () => {
    const i18n = createTypedI18n();
    const { init, loadLocale, resolveLocale, setLocale, translate, addEventListener, removeEventListener } = i18n;
    const locales: string[] = [];
    const onLocaleChange = (event: CustomEvent<{ locale: string }>) => locales.push(event.detail.locale);

    addEventListener("locale-change", onLocaleChange);
    await init();
    await setLocale("pt");
    removeEventListener("locale-change", onLocaleChange);
    await setLocale("en");

    expect(resolveLocale(" PT ")).toBe("pt");
    expect(await loadLocale("pt")).toEqual({ "home.title": "Bem-vindo" });
    expect(translate("footer")).toBe("Bye");
    expect(locales).toEqual(["pt"]);
  });

  it("should throw before initialization when called detached", () => {
    const { t } = createTypedI18n();

    expect(() => t("home.title")).toThrow("[I18n] translate() requires successful initialization.");
  });
});

describe("typed translation keys", () => {
  it("should accept flattened keys inferred from the loaded dictionaries", async () => {
    const i18n = createTypedI18n();
    await i18n.init();

    const keys = ["home.title", "home.intro", "footer"] satisfies Parameters<typeof i18n.t>[0][];

    expect(keys.map((key) => i18n.t(key))).toEqual(["Welcome", "Start here", "Bye"]);
  });

  it("should reject unknown and partial keys at compile time", async () => {
    const i18n = createTypedI18n();
    await i18n.init();

    // @ts-expect-error - a misspelled key is not in the dictionary
    expect(i18n.t("home.titel")).toBeUndefined();
    // @ts-expect-error - a group is not a translation
    expect(i18n.t("home")).toBeUndefined();
  });

  it("should infer keys from an asynchronous loader", async () => {
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en"] as const,
      loadLocale: async () => dictionaries.en,
      getLocaleDirection: () => "ltr",
      isSilent: true,
    });
    await i18n.init();

    expect(i18n.t("home.title")).toBe("Welcome");
    // @ts-expect-error - keys come from the resolved dictionary type
    expect(i18n.t("missing")).toBeUndefined();
  });

  it("should accept any string key when the loader type is unknown", async () => {
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en"] as const,
      loadLocale: (): unknown => ({ "dynamic.key": "Value" }),
      getLocaleDirection: () => "ltr",
    });
    await i18n.init();
    const key: string = "dynamic.key";

    expect(i18n.t(key)).toBe("Value");
  });

  it("should accept any string key when the loader returns any, as response.json() does", async () => {
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en"] as const,
      loadLocale: async () => JSON.parse('{ "dynamic": { "key": "Value" } }'),
      getLocaleDirection: () => "ltr",
    });
    await i18n.init();
    const key: string = "dynamic.key";

    expect(i18n.t(key)).toBe("Value");
  });

  it("should remain assignable to a manager with string keys, as browser bindings accept", () => {
    const i18n: I18n<"en" | "pt"> = createTypedI18n();

    expect(i18n.locales).toEqual(["en", "pt"]);
  });
});
