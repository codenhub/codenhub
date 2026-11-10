// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createLocaleRouting, type LocaleRoutingConfig } from "../routing";
import { normalizeSegment } from "./path";
import type * as PathModule from "./path";

// Counts calls without changing what normalizeSegment returns, so every other test sees the real behavior.
vi.mock("./path", async (importOriginal) => {
  const actual = await importOriginal<typeof PathModule>();
  return { ...actual, normalizeSegment: vi.fn(actual.normalizeSegment) };
});

const LOCALES = ["en-US", "pt-BR"] as const;

describe("createLocaleRouting", () => {
  it("should type locales from `locales` and reject a widened default locale", () => {
    const config = {
      defaultLocale: "en-US",
      locales: LOCALES,
      localePrefix: "except-default" as const,
    };

    // @ts-expect-error - a `string` default locale would otherwise make `localize()` accept any string
    expect(createLocaleRouting(config).localize("/", "en-US")).toBe("/");

    const routing = createLocaleRouting({
      ...config,
      defaultLocale: "en-US" as const,
    });
    // @ts-expect-error - "fr" is not a configured locale
    expect(() => routing.localize("/", "fr")).toThrow(RangeError);
  });

  it("should parse a supported locale prefix", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      localePrefix: "always",
    });

    expect(routing.parse("/PT-br/about/")).toEqual({
      locale: "pt-BR",
      pathname: "/about/",
    });
    expect(routing.parse("/EN-us")).toEqual({ locale: "en-US", pathname: "/" });
  });

  it("should reject invalid locale routing configuration", () => {
    const invalidConfigs: LocaleRoutingConfig<string>[] = [
      { defaultLocale: "en", locales: [], localePrefix: "always" },
      { defaultLocale: "en", locales: ["en", "  "], localePrefix: "always" },
      { defaultLocale: "en", locales: ["en", "EN"], localePrefix: "always" },
      { defaultLocale: "en", locales: ["en", " EN "], localePrefix: "always" },
      {
        defaultLocale: "en",
        locales: ["en", "../admin"],
        localePrefix: "always",
      },
      { defaultLocale: "en", locales: ["en", "pt BR"], localePrefix: "always" },
      {
        defaultLocale: "en",
        locales: ["en", "fr?admin"],
        localePrefix: "always",
      },
      { defaultLocale: "pt", locales: ["en"], localePrefix: "always" },
      {
        defaultLocale: "en",
        locales: ["en"],
        localePrefix: "yes" as unknown as "always",
      },
    ];

    for (const config of invalidConfigs) {
      expect(() => createLocaleRouting(config)).toThrow(TypeError);
    }
  });

  it("should name the property and the problem when the configuration is invalid", () => {
    const create = (overrides: object) => () =>
      createLocaleRouting({
        defaultLocale: "en",
        locales: ["en", "pt"],
        localePrefix: "always",
        ...overrides,
      });

    expect(create({ locales: [] })).toThrow(
      "[I18n] Invalid locale routing configuration: locales: Must contain at least 1 item",
    );
    expect(create({ locales: ["en", "EN"] })).toThrow("locales[1]: Must be unique, ignoring letter case");
    expect(create({ locales: ["en", "../admin"] })).toThrow("locales[1]: Must be an ASCII locale identifier");
    expect(create({ defaultLocale: "fr" })).toThrow("defaultLocale: Must match a configured locale");
    expect(create({ localePrefix: "yes" })).toThrow(
      'localePrefix: Expected "always", "except-default", or "when-ambiguous", received string',
    );
    expect(create({ localePrefix: undefined })).toThrow("localePrefix: Expected");
  });

  it("should require a plain object, reading only its own properties", () => {
    const inherited = Object.create({
      defaultLocale: "en",
      locales: ["en"],
      localePrefix: "always",
    }) as object;
    class RoutingConfig {
      readonly defaultLocale = "en";
      readonly locales = ["en"];
      readonly localePrefix = "always";
    }

    expect(() => createLocaleRouting(inherited as Parameters<typeof createLocaleRouting>[0])).toThrow(
      "[I18n] Invalid locale routing configuration: Expected object, received non-plain object",
    );
    expect(() => createLocaleRouting(new RoutingConfig())).toThrow("received non-plain object");
  });

  it("should apply the default-locale prefix policy when parsing unprefixed paths", () => {
    const requiredPrefix = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      localePrefix: "always",
    });
    const optionalDefaultPrefix = createLocaleRouting({
      defaultLocale: "EN-us" as (typeof LOCALES)[number],
      locales: LOCALES,
      localePrefix: "except-default",
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

  it("should throw from parse for values a URL's pathname never is", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      localePrefix: "always",
    });

    for (const pathname of ["", "about", "https://example.com/about", "/about?tab=details", "/about#details"]) {
      expect(() => routing.parse(pathname)).toThrow(TypeError);
    }
    expect(() => routing.parse(42 as unknown as string)).toThrow(TypeError);
  });

  it("should return undefined from parse for request paths it refuses, which localize still rejects", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      localePrefix: "except-default",
    });
    const refusedPathnames = [
      "//example.com/about",
      "//wp-login.php",
      "/about//team",
      "/about/./team",
      "/about/../team",
      "/about/%2e/team",
      "/about/%2E%2e/team",
      "/about%2Fteam",
      "/about%5cteam",
      "/about\\team",
      "/about\rteam",
      "/about\nteam",
      "/about\0team",
      "/about\u007fteam",
      "/about%",
      "/about%2",
      "/about%GG",
      "/about%0dteam",
      "/about%0Ateam",
      "/about%00team",
      "/about%7fteam",
      "/%252e%252e/admin",
      "/about%252fadmin",
      "/about%250ateam",
      "/sale%25off",
      `/${"a".repeat(8_192)}`,
    ];

    for (const pathname of refusedPathnames) {
      expect(routing.parse(pathname)).toBeUndefined();
      expect(() => routing.localize(pathname, "en-US")).toThrow(TypeError);
    }
    expect(routing.parse(`/${"a".repeat(8_191)}`)).toBeDefined();
  });

  it("should throw a RangeError when the locale prefix makes a valid path too long", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      localePrefix: "always",
    });
    const pathname = `/${"a".repeat(8_191)}`;

    expect(() => routing.localize(pathname, "pt-BR")).toThrow(RangeError);
    expect(() => routing.localize(pathname, "pt-BR")).toThrow(
      '[I18n] the path in "pt-BR" would be longer than 8,192 characters',
    );
  });

  it("should prefix its errors with the package name", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      localePrefix: "always",
    });

    expect(() => routing.parse("about")).toThrow(/^\[I18n\] /);
    expect(() => routing.localize("/../admin", "en-US")).toThrow(/^\[I18n\] /);
    expect(() => routing.localize("/about", "fr" as (typeof LOCALES)[number])).toThrow(/^\[I18n\] /);
  });

  it("should generate canonical prefixed pathnames and preserve non-root trailing slashes", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      localePrefix: "always",
    });

    expect(routing.localize("/", "pt-BR")).toBe("/pt-BR");
    expect(routing.localize("/about", "pt-BR")).toBe("/pt-BR/about");
    expect(routing.localize("/about/", "pt-BR")).toBe("/pt-BR/about/");
  });

  it("should match locale arguments case-insensitively and reject unsupported locales", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      localePrefix: "always",
    });

    expect(routing.localize("/about", "PT-br" as (typeof LOCALES)[number])).toBe("/pt-BR/about");
    expect(() => routing.localize("/about", "fr" as (typeof LOCALES)[number])).toThrow(RangeError);
  });

  it("should leave generated default-locale paths unprefixed when configured", () => {
    const routing = createLocaleRouting({
      defaultLocale: "EN-us" as (typeof LOCALES)[number],
      locales: LOCALES,
      localePrefix: "except-default",
    });

    expect(routing.localize("/", "en-US")).toBe("/");
    expect(routing.localize("/about/", "en-US")).toBe("/about/");
    expect(routing.localize("/about", "pt-BR")).toBe("/pt-BR/about");
  });

  it("should replace recognized prefixes while preserving unsupported leading segments", () => {
    const routing = createLocaleRouting({
      defaultLocale: "en-US",
      locales: LOCALES,
      localePrefix: "except-default",
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
      localePrefix: "except-default",
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
      localePrefix: "always",
    };
    const routing = createLocaleRouting(config);

    locales[0] = "fr";
    locales.push("es");
    config.defaultLocale = "pt";
    config.localePrefix = "except-default";

    expect(routing.parse("/en/about")).toEqual({
      locale: "en",
      pathname: "/about",
    });
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
      localePrefix: "except-default",
    });

    expect(routing.parse("/about")).toEqual({
      locale: "en-US",
      pathname: "/about",
    });
    expect(routing.parse("/PT-br/about")).toEqual({
      locale: "pt-BR",
      pathname: "/about",
    });
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
      localePrefix: "always",
    });
    const invalidLocales = [undefined, null, 1, { locale: "en-US" }];

    for (const locale of invalidLocales) {
      expect(() => routing.localize("/about", locale as unknown as (typeof LOCALES)[number])).toThrow(RangeError);
    }
  });

  it("should normalize each distinct segment at most once per parse", () => {
    // Normalizing an escape that isn't UTF-8, such as `%C3`, costs about ten times a plain segment, so a request made
    // of them must not pay that once per lookup. Counting calls bounds the cost without timing the machine.
    const segments = Array.from({ length: 200 }, (_, index) => `%C3${index}`);
    const canonical = ["docs", ...segments];
    const requests = {
      prefixed: `/pt-BR/documentos/${segments.join("/")}`,
      unprefixed: `/docs/${segments.join("/")}/`,
    };
    // A rejected request could normalize nothing, so the results show that each request was read in full.
    const expected = {
      prefixed: { locale: "pt-BR", pathname: `/${canonical.join("/")}` },
      unprefixed: { locale: "en-US", pathname: `/${canonical.join("/")}/` },
    };

    for (const localePrefix of ["always", "except-default", "when-ambiguous"] as const) {
      const routing = createLocaleRouting({
        defaultLocale: "en-US",
        locales: LOCALES,
        localePrefix,
        pathnames: { "/docs/:path*": { "pt-BR": "/documentos/:path*" } },
      });

      for (const kind of ["prefixed", "unprefixed"] as const) {
        const request = requests[kind];
        vi.mocked(normalizeSegment).mockClear();
        const result = routing.parse(request);
        // `always` has no unprefixed paths.
        expect(result, `${localePrefix}, ${kind}`).toEqual(
          localePrefix === "always" && kind === "unprefixed" ? undefined : expected[kind],
        );
        const distinct = new Set([...request.split("/").filter(Boolean), ...canonical]);

        expect(vi.mocked(normalizeSegment).mock.calls.length, `${localePrefix}, ${kind}`).toBeLessThanOrEqual(
          distinct.size,
        );
      }
    }
  });

  describe("trailingSlash", () => {
    const create = (
      trailingSlash: LocaleRoutingConfig<(typeof LOCALES)[number]>["trailingSlash"],
      localePrefix: LocaleRoutingConfig<(typeof LOCALES)[number]>["localePrefix"] = "except-default",
    ) =>
      createLocaleRouting({
        defaultLocale: "en-US",
        locales: LOCALES,
        localePrefix,
        pathnames: { "/brand": { "pt-BR": "/marca" } },
        trailingSlash,
      });

    it("should keep the given path's slash by default, with none on a locale's root", () => {
      for (const routing of [create(undefined), create("preserve")]) {
        expect(routing.localize("/", "pt-BR")).toBe("/pt-BR");
        expect(routing.localize("/brand", "pt-BR")).toBe("/pt-BR/marca");
        expect(routing.localize("/brand/", "pt-BR")).toBe("/pt-BR/marca/");
      }
    });

    it("should end every built path with a slash with `always`, a locale's root included", () => {
      const routing = create("always");

      expect(routing.localize("/", "en-US")).toBe("/");
      expect(routing.localize("/", "pt-BR")).toBe("/pt-BR/");
      expect(routing.localize("/brand", "pt-BR")).toBe("/pt-BR/marca/");
      expect(routing.localize("/brand/", "en-US")).toBe("/brand/");
      expect(routing.localizeAll("/")).toEqual([
        { locale: "en-US", pathname: "/" },
        { locale: "pt-BR", pathname: "/pt-BR/" },
      ]);
      expect(create("always", "always").localize("/", "en-US")).toBe("/en-US/");
      expect(create("always", "when-ambiguous").localize("/brand", "pt-BR")).toBe("/marca/");
    });

    it("should end no built path with a slash with `never`, except the root", () => {
      const routing = create("never");

      expect(routing.localize("/", "en-US")).toBe("/");
      expect(routing.localize("/", "pt-BR")).toBe("/pt-BR");
      expect(routing.localize("/brand/", "pt-BR")).toBe("/pt-BR/marca");
      expect(routing.localize("/pt-BR/marca/", "en-US")).toBe("/brand");
    });

    it("should parse both spellings, keeping the request's slash, so a redirect can send one to the other", () => {
      for (const trailingSlash of ["always", "never"] as const) {
        const routing = create(trailingSlash);

        expect(routing.parse("/pt-BR/marca")).toEqual({ locale: "pt-BR", pathname: "/brand" });
        expect(routing.parse("/pt-BR/marca/")).toEqual({ locale: "pt-BR", pathname: "/brand/" });
        expect(routing.parse("/pt-BR")).toEqual({ locale: "pt-BR", pathname: "/" });
        expect(routing.parse("/pt-BR/")).toEqual({ locale: "pt-BR", pathname: "/" });
      }
      const routing = create("always");
      const route = routing.parse("/pt-BR/marca")!;
      expect(routing.localize(route.pathname, route.locale)).toBe("/pt-BR/marca/");
    });

    it("should parse no path whose canonical URL would pass the limit once `always` adds its slash", () => {
      const routing = create("always");
      const pathname = `/${"a".repeat(8_191)}`;

      expect(routing.parse(pathname)).toBeUndefined();
      expect(() => routing.localize(pathname, "en-US")).toThrow(RangeError);
      expect(create("preserve").parse(pathname)).toBeDefined();
    });

    it("should reject a value that is not a policy", () => {
      expect(() => create("sometimes" as "always")).toThrow(
        '[I18n] Invalid locale routing configuration: trailingSlash: Expected "preserve", "always", or "never", received string',
      );
    });
  });
});
