// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createLocaleRouting, type LocaleRoutingConfig } from "../routing";

const LOCALES = ["en-US", "pt-BR"] as const;

describe("createLocaleRouting", () => {
  it("should parse a supported locale prefix", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      prefixDefaultLocale: true,
    });

    expect(routing.parse("/PT-br/about/")).toEqual({
      locale: "pt-BR",
      pathname: "/about/",
    });
    expect(routing.parse("/EN-us")).toEqual({ locale: "en-US", pathname: "/" });
  });

  it("should reject invalid locale routing configuration", () => {
    const invalidConfigs: LocaleRoutingConfig<string>[] = [
      { defaultLocale: "en", locales: [], prefixDefaultLocale: true },
      { defaultLocale: "en", locales: ["en", "  "], prefixDefaultLocale: true },
      { defaultLocale: "en", locales: ["en", "EN"], prefixDefaultLocale: true },
      { defaultLocale: "en", locales: ["en", " EN "], prefixDefaultLocale: true },
      { defaultLocale: "pt", locales: ["en"], prefixDefaultLocale: true },
      {
        defaultLocale: "en",
        locales: ["en"],
        prefixDefaultLocale: "yes" as unknown as boolean,
      },
    ];

    for (const config of invalidConfigs) {
      expect(() => createLocaleRouting(config)).toThrow(TypeError);
    }
  });

  it("should apply the default-locale prefix policy when parsing unprefixed paths", () => {
    const requiredPrefix = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      prefixDefaultLocale: true,
    });
    const optionalDefaultPrefix = createLocaleRouting({
      defaultLocale: "EN-us" as (typeof LOCALES)[number],
      locales: LOCALES,
      prefixDefaultLocale: false,
    });

    expect(requiredPrefix.parse("/about")).toBeUndefined();
    expect(optionalDefaultPrefix.parse("/about")).toEqual({
      locale: "en-US",
      pathname: "/about",
    });
    expect(optionalDefaultPrefix.parse("/EN-us/about")).toEqual({
      locale: "en-US",
      pathname: "/about",
    });
    expect(optionalDefaultPrefix.parse("/pt-BR-other/about")).toEqual({
      locale: "en-US",
      pathname: "/pt-BR-other/about",
    });
  });

  it("should reject malformed application pathnames", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      prefixDefaultLocale: true,
    });
    const invalidPathnames = [
      "",
      "about",
      "https://example.com/about",
      "//example.com/about",
      "/about?tab=details",
      "/about#details",
      "/about//team",
      "/about/./team",
      "/about/../team",
      "/about/%2e/team",
      "/about/%2E%2e/team",
      "/about%2Fteam",
      "/about%5cteam",
      "/about\\team",
    ];

    for (const pathname of invalidPathnames) {
      expect(() => routing.parse(pathname)).toThrow(TypeError);
    }
  });

  it("should generate canonical prefixed pathnames and preserve non-root trailing slashes", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      prefixDefaultLocale: true,
    });

    expect(routing.localize("/", "pt-BR")).toBe("/pt-BR");
    expect(routing.localize("/about", "pt-BR")).toBe("/pt-BR/about");
    expect(routing.localize("/about/", "pt-BR")).toBe("/pt-BR/about/");
  });

  it("should match locale arguments case-insensitively and reject unsupported locales", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      prefixDefaultLocale: true,
    });

    expect(routing.localize("/about", "PT-br" as (typeof LOCALES)[number])).toBe("/pt-BR/about");
    expect(() => routing.localize("/about", "fr" as (typeof LOCALES)[number])).toThrow(RangeError);
  });

  it("should leave generated default-locale paths unprefixed when configured", () => {
    const routing = createLocaleRouting({
      defaultLocale: "EN-us" as (typeof LOCALES)[number],
      locales: LOCALES,
      prefixDefaultLocale: false,
    });

    expect(routing.localize("/", "en-US")).toBe("/");
    expect(routing.localize("/about/", "en-US")).toBe("/about/");
    expect(routing.localize("/about", "pt-BR")).toBe("/pt-BR/about");
  });

  it("should replace recognized prefixes while preserving unsupported leading segments", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      prefixDefaultLocale: false,
    });

    expect(routing.localize("/PT-br/about/", "pt-BR")).toBe("/pt-BR/about/");
    expect(routing.localize("/pt-BR/about", "en-US")).toBe("/about");
    expect(routing.localize("/fr/about", "pt-BR")).toBe("/pt-BR/fr/about");
    expect(routing.localize("/pt-BR-other/about", "pt-BR")).toBe("/pt-BR/pt-BR-other/about");
  });

  it("should localize every path in configuration order", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: ["pt-BR", "en-US"] as const,
      prefixDefaultLocale: false,
    });

    expect(routing.localizeAll("/en-US/about/")).toEqual([
      { locale: "pt-BR", pathname: "/pt-BR/about/" },
      { locale: "en-US", pathname: "/about/" },
    ]);
  });

  it("should snapshot configuration so caller mutations cannot affect behavior", () => {
    const locales = ["en", "pt"];
    const config: LocaleRoutingConfig<string> = {
      defaultLocale: "en",
      locales,
      prefixDefaultLocale: true,
    };
    const routing = createLocaleRouting(config);

    locales[0] = "fr";
    locales.push("es");
    config.defaultLocale = "pt";
    config.prefixDefaultLocale = false;

    expect(routing.parse("/en/about")).toEqual({ locale: "en", pathname: "/about" });
    expect(routing.parse("/fr/about")).toBeUndefined();
    expect(routing.localize("/about", "en")).toBe("/en/about");
    expect(routing.localizeAll("/about")).toEqual([
      { locale: "en", pathname: "/en/about" },
      { locale: "pt", pathname: "/pt/about" },
    ]);
  });

  it("should trim locale configuration and emit trimmed canonical identifiers", () => {
    const routing = createLocaleRouting<string>({
      defaultLocale: " EN-us ",
      locales: [" en-US ", " pt-BR "],
      prefixDefaultLocale: false,
    });

    expect(routing.parse("/about")).toEqual({ locale: "en-US", pathname: "/about" });
    expect(routing.parse("/PT-br/about")).toEqual({ locale: "pt-BR", pathname: "/about" });
    expect(routing.localize("/about", " PT-br ")).toBe("/pt-BR/about");
    expect(routing.localizeAll("/about")).toEqual([
      { locale: "en-US", pathname: "/about" },
      { locale: "pt-BR", pathname: "/pt-BR/about" },
    ]);
  });

  it("should throw RangeError for runtime non-string locale arguments", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      prefixDefaultLocale: true,
    });
    const invalidLocales = [undefined, null, 1, { locale: "en-US" }];

    for (const locale of invalidLocales) {
      expect(() => routing.localize("/about", locale as unknown as (typeof LOCALES)[number])).toThrow(RangeError);
    }
  });
});
