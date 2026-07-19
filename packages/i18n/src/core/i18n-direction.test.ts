// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createI18n, type I18nConfig, type LocaleDirection } from "../index";

const createConfig = (getLocaleDirection: (locale: "en" | "pt") => LocaleDirection): I18nConfig<"en" | "pt"> => ({
  defaultLocale: "en",
  locales: ["en", "pt"],
  loadLocale: (locale) => ({ greeting: locale === "en" ? "Hello" : "Ola" }),
  getLocaleDirection,
});

const asDirectionCallback = (callback: (locale: "en" | "pt") => unknown) =>
  callback as I18nConfig<"en" | "pt">["getLocaleDirection"];

describe("I18n locale direction validation", () => {
  it("rejects an invalid initial direction when creating the manager", () => {
    const getLocaleDirection = vi.fn(() => "sideways");

    expect(() => createI18n(createConfig(asDirectionCallback(getLocaleDirection)))).toThrow(TypeError);
  });

  it("validates a repeated direction result before initial state is applied", async () => {
    const getLocaleDirection = vi.fn().mockReturnValueOnce("ltr").mockReturnValueOnce("sideways");
    const i18n = createI18n(createConfig(asDirectionCallback(getLocaleDirection)));
    const onReady = vi.fn();
    i18n.addEventListener("ready", onReady);

    await expect(i18n.init()).rejects.toBeInstanceOf(TypeError);

    expect(i18n.isReady).toBe(false);
    expect(i18n.locale).toBe("en");
    expect(i18n.direction).toBe("ltr");
    expect(onReady).not.toHaveBeenCalled();
  });

  it("preserves ready state when a repeated init direction is invalid", async () => {
    const getLocaleDirection = vi
      .fn()
      .mockReturnValueOnce("ltr")
      .mockReturnValueOnce("ltr")
      .mockReturnValueOnce("sideways");
    const i18n = createI18n(createConfig(asDirectionCallback(getLocaleDirection)));
    await i18n.init();
    const onReady = vi.fn();
    i18n.addEventListener("ready", onReady);

    await expect(i18n.init({ locale: "pt" })).rejects.toBeInstanceOf(TypeError);

    expect(i18n.isReady).toBe(true);
    expect(i18n.locale).toBe("en");
    expect(i18n.direction).toBe("ltr");
    expect(i18n.translate("greeting")).toBe("Hello");
    expect(onReady).not.toHaveBeenCalled();
  });

  it("preserves active state when a locale-change direction is invalid", async () => {
    const getLocaleDirection = vi
      .fn()
      .mockReturnValueOnce("ltr")
      .mockReturnValueOnce("ltr")
      .mockReturnValueOnce("sideways");
    const i18n = createI18n(createConfig(asDirectionCallback(getLocaleDirection)));
    await i18n.init();
    const onLocaleChange = vi.fn();
    i18n.addEventListener("locale-change", onLocaleChange);

    await expect(i18n.setLocale("pt")).rejects.toBeInstanceOf(TypeError);

    expect(i18n.isReady).toBe(true);
    expect(i18n.locale).toBe("en");
    expect(i18n.direction).toBe("ltr");
    expect(i18n.translate("greeting")).toBe("Hello");
    expect(onLocaleChange).not.toHaveBeenCalled();
  });
});
