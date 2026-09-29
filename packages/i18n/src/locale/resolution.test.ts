// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { I18nConfig } from "../core/types";
import { resolveConfiguredLocale, validateI18nConfig } from "./resolution";

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
    ["non-object config", null, "Expected object, received null"],
    [
      "non-array locales",
      createConfig({ locales: null as unknown as readonly string[] }),
      "locales: Expected array, received null",
    ],
    ["empty locales", createConfig({ locales: [] }), "locales: Must contain at least 1 item"],
    [
      "non-string locale",
      createConfig({ locales: ["en-US", 1 as unknown as string] }),
      "locales[1]: Expected string, received number",
    ],
    ["empty locale identifier", createConfig({ locales: ["en-US", " "] }), "locales[1]: Must not be empty"],
    [
      "unsafe locale identifier",
      createConfig({ locales: ["en-US", "../admin"] }),
      "locales[1]: Must be an ASCII locale identifier",
    ],
    [
      "locale identifier with whitespace",
      createConfig({ locales: ["en-US", "pt BR"] }),
      "locales[1]: Must be an ASCII locale identifier",
    ],
    [
      "case-insensitive duplicate",
      createConfig({ locales: ["en-US", "EN-us"] }),
      "locales[1]: Must be unique, ignoring letter case",
    ],
    [
      "duplicate after trimming",
      createConfig({ locales: [" en-US ", "EN-us"] }),
      "locales[1]: Must be unique, ignoring letter case",
    ],
    ["unsupported default", createConfig({ defaultLocale: "fr" }), "defaultLocale: Must match a configured locale"],
    [
      "missing loader",
      createConfig({ loadLocale: undefined as unknown as I18nConfig<string>["loadLocale"] }),
      "loadLocale: Must be a function",
    ],
    [
      "missing direction callback",
      createConfig({ getLocaleDirection: undefined as unknown as I18nConfig<string>["getLocaleDirection"] }),
      "getLocaleDirection: Must be a function",
    ],
    [
      "non-boolean silent mode",
      createConfig({ isSilent: "yes" as unknown as boolean }),
      "isSilent: Expected boolean, received string",
    ],
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
