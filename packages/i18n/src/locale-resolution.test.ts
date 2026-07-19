// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { resolveConfiguredLocale, validateI18nConfig } from "./locale-resolution";
import type { I18nConfig } from "./types";

const createConfig = (overrides: Partial<I18nConfig<string>> = {}): I18nConfig<string> => ({
  defaultLocale: "en-US",
  locales: ["en-US", "pt-BR"],
  loadLocale: vi.fn(() => ({ key: "value" })),
  getLocaleDirection: vi.fn(() => "ltr" as const),
  ...overrides,
});

describe("validateI18nConfig", () => {
  it("copies and freezes locale metadata while canonicalizing the default locale", () => {
    const sourceLocales = ["en-US", "pt-BR"];
    const config = validateI18nConfig(createConfig({ defaultLocale: "EN-us", locales: sourceLocales }));

    sourceLocales.push("fr");

    expect(config.defaultLocale).toBe("en-US");
    expect(config.locales).toEqual(["en-US", "pt-BR"]);
    expect(config.locales).not.toBe(sourceLocales);
    expect(Object.isFrozen(config.locales)).toBe(true);
    expect(config.isSilent).toBe(false);
  });

  it("trims configured locales before snapshotting and canonicalizing the default", () => {
    const sourceLocales = [" en-US ", " pt-BR "];
    const config = validateI18nConfig(
      createConfig({
        defaultLocale: " EN-us ",
        locales: sourceLocales,
      }),
    );

    expect(config.defaultLocale).toBe("en-US");
    expect(config.locales).toEqual(["en-US", "pt-BR"]);
    expect(sourceLocales).toEqual([" en-US ", " pt-BR "]);
    expect(Object.isFrozen(config.locales)).toBe(true);
  });

  it.each([
    ["non-object config", null, "configuration must be an object"],
    ["non-array locales", createConfig({ locales: null as unknown as readonly string[] }), "locales must be an array"],
    ["empty locales", createConfig({ locales: [] }), "locales must not be empty"],
    ["non-string locale", createConfig({ locales: ["en-US", 1 as unknown as string] }), "non-empty strings"],
    ["empty locale identifier", createConfig({ locales: ["en-US", " "] }), "non-empty strings"],
    ["case-insensitive duplicate", createConfig({ locales: ["en-US", "EN-us"] }), "unique"],
    ["duplicate after trimming", createConfig({ locales: [" en-US ", "EN-us"] }), "unique"],
    ["unsupported default", createConfig({ defaultLocale: "fr" }), "defaultLocale must match"],
    [
      "missing loader",
      createConfig({ loadLocale: undefined as unknown as I18nConfig<string>["loadLocale"] }),
      "loadLocale must be a function",
    ],
    [
      "missing direction callback",
      createConfig({ getLocaleDirection: undefined as unknown as I18nConfig<string>["getLocaleDirection"] }),
      "getLocaleDirection must be a function",
    ],
    ["non-boolean silent mode", createConfig({ isSilent: "yes" as unknown as boolean }), "isSilent must be a boolean"],
  ])("rejects %s", (_name, input, message) => {
    const validate = () => validateI18nConfig(input as I18nConfig<string>);

    expect(validate).toThrow(TypeError);
    expect(validate).toThrow(message);
  });
});

describe("resolveConfiguredLocale", () => {
  it("trims and returns the canonical case-insensitive locale match", () => {
    expect(resolveConfiguredLocale(["en-US", "pt-BR"], " PT-br ")).toBe("pt-BR");
  });

  it("returns undefined for empty, unsupported, or non-string input", () => {
    expect(resolveConfiguredLocale(["en-US"], " ")).toBeUndefined();
    expect(resolveConfiguredLocale(["en-US"], "en")).toBeUndefined();
    expect(resolveConfiguredLocale(["en-US"], null as unknown as string)).toBeUndefined();
  });
});
