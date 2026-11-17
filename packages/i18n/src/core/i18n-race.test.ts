// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createI18n, I18nError, type I18nConfig } from "../index";

describe("I18n initialization races", () => {
  it("does not let an invalid init cancel an earlier valid in-flight init", async () => {
    let resolveDictionary: ((dictionary: unknown) => void) | undefined;
    const dictionary = new Promise<unknown>((resolve) => {
      resolveDictionary = resolve;
    });
    const config: I18nConfig<"en"> = {
      defaultLocale: "en",
      locales: ["en"],
      loadLocale: vi.fn(() => dictionary),
      getLocaleDirection: () => "ltr",
    };
    const i18n = createI18n(config);
    const onReady = vi.fn();
    i18n.addEventListener("ready", onReady);

    const validInit = i18n.init();
    await expect(i18n.init({ locale: null as unknown as "en" })).rejects.toBeInstanceOf(RangeError);
    resolveDictionary?.({ greeting: "Hello" });
    await validInit;

    expect(i18n.isReady).toBe(true);
    expect(i18n.locale).toBe("en");
    expect(i18n.translate("greeting")).toBe("Hello");
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("resolves an overtaken setLocale() whose loading fails, since the later call decides the language", async () => {
    let rejectPortuguese: ((error: Error) => void) | undefined;
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en", "pt", "fr"] as const,
      loadLocale: (locale) =>
        locale === "pt"
          ? new Promise<never>((_, reject) => {
              rejectPortuguese = reject;
            })
          : { greeting: locale },
    });
    await i18n.init();

    const portuguese = i18n.setLocale("pt");
    await i18n.setLocale("fr");
    rejectPortuguese?.(new Error("offline"));

    await expect(portuguese).resolves.toBeUndefined();
    expect(i18n.locale).toBe("fr");
  });

  it("resolves an overtaken init() whose loading fails, and still rejects the latest call's failure", async () => {
    let rejectPortuguese: ((error: Error) => void) | undefined;
    const i18n = createI18n({
      defaultLocale: "en",
      locales: ["en", "pt", "fr"] as const,
      loadLocale: (locale) => {
        if (locale === "pt") {
          return new Promise<never>((_, reject) => {
            rejectPortuguese = reject;
          });
        }
        if (locale === "fr") {
          throw new Error("fr is broken");
        }
        return { greeting: locale };
      },
    });

    const portuguese = i18n.init({ locale: "pt" });
    await i18n.init();
    rejectPortuguese?.(new Error("offline"));

    await expect(portuguese).resolves.toBeUndefined();
    expect(i18n.locale).toBe("en");
    await expect(i18n.setLocale("fr")).rejects.toThrow(I18nError);
    expect(i18n.locale).toBe("en");
  });
});
