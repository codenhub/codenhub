// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createLocaleRouting, type LocaleRoutingConfig } from "../routing";

type Locale = "en" | "pt" | "es";

const LOCALES = ["en", "pt", "es"] as const;

const PATHNAMES = {
  "/about": { pt: "/sobre", es: "/acerca" },
  "/products/:id": { pt: "/produtos/:id" },
  "/products/:id/reviews/:reviewId": {
    pt: "/avaliacoes/:reviewId/produto/:id",
  },
};

const create = (overrides: Partial<LocaleRoutingConfig<Locale>> = {}) =>
  createLocaleRouting<Locale>({
    defaultLocale: "en",
    locales: LOCALES,
    localePrefix: "except-default",
    pathnames: PATHNAMES,
    ...overrides,
  });

describe("translated pathnames", () => {
  describe("with a locale prefix", () => {
    it("should localize a listed canonical path into each locale's words", () => {
      const routing = create();

      expect(routing.localize("/about", "pt")).toBe("/pt/sobre");
      expect(routing.localize("/about", "es")).toBe("/es/acerca");
      expect(routing.localize("/about", "en")).toBe("/about");
      expect(routing.localize("/products/42", "pt")).toBe("/pt/produtos/42");
    });

    it("should parse a translated path back to its canonical path", () => {
      const routing = create();

      expect(routing.parse("/pt/sobre")).toMatchObject({
        locale: "pt",
        pathname: "/about",
      });
      expect(routing.parse("/PT/produtos/42")).toMatchObject({
        locale: "pt",
        pathname: "/products/42",
      });
    });

    it("should keep the canonical words for a locale or path the table does not list", () => {
      const routing = create();

      expect(routing.localize("/products/42", "es")).toBe("/es/products/42");
      expect(routing.localize("/blog", "pt")).toBe("/pt/blog");
      expect(routing.parse("/es/products/42")).toMatchObject({
        locale: "es",
        pathname: "/products/42",
      });
      expect(routing.parse("/pt/blog")).toMatchObject({
        locale: "pt",
        pathname: "/blog",
      });
    });

    it("should move parameters to where each language puts them", () => {
      const routing = create();

      expect(routing.localize("/products/42/reviews/7", "pt")).toBe("/pt/avaliacoes/7/produto/42");
      expect(routing.parse("/pt/avaliacoes/7/produto/42")).toMatchObject({
        locale: "pt",
        pathname: "/products/42/reviews/7",
      });
    });

    it("should copy parameter values, written as a URL's pathname writes them", () => {
      const routing = create();

      expect(routing.localize("/products/caf%C3%A9%20bar", "pt")).toBe("/pt/produtos/caf%C3%A9%20bar");
      expect(routing.parse("/pt/produtos/caf%c3%a9")).toMatchObject({
        locale: "pt",
        pathname: "/products/caf%C3%A9",
      });
    });

    it.each([
      ["/products/c%2B%2B", "/products/c%2B%2B"],
      ["/products/a%3bb", "/products/a%3Bb"],
      ["/products/%40%3D%2C%26%24", "/products/%40%3D%2C%26%24"],
      ["/products/%3Aid", "/products/%3Aid"],
      ["/products/c++", "/products/c++"],
      ["/products/%61%7E%2D%2E%5F", "/products/a~-._"],
    ])("should keep an escaped reserved character escaped, as a URL does: %s", (path, pathname) => {
      const routing = create();

      expect(new URL(path, "https://example.com").pathname.toUpperCase()).toBe(path.toUpperCase());
      expect(routing.parse(path)).toMatchObject({ locale: "en", pathname });
      expect(routing.localize(path, "en")).toBe(pathname);
    });

    it("should not read an escaped reserved character as the character, so c%2B%2B and c++ are two pages", () => {
      const routing = create();

      expect(routing.parse("/products/c%2B%2B")?.pathname).not.toBe(routing.parse("/products/c++")?.pathname);
      expect(routing.parse("/pt/produtos/%3Aid")?.pathname).toBe("/products/%3Aid");
    });

    it("should write a lone surrogate as the replacement character's escape, as a URL does", () => {
      const routing = create();
      const url = new URL("https://example.com/");
      url.pathname = "/products/\uD800";

      expect(url.pathname).toBe("/products/%EF%BF%BD");
      expect(routing.localize("/products/\uD800", "pt")).toBe("/pt/produtos/%EF%BF%BD");
      expect(routing.parse("/products/\uDC00x")?.pathname).toBe("/products/%EF%BF%BDx");
    });

    it("should keep one trailing slash", () => {
      const routing = create();

      expect(routing.localize("/about/", "pt")).toBe("/pt/sobre/");
      expect(routing.parse("/pt/sobre/")).toMatchObject({
        locale: "pt",
        pathname: "/about/",
      });
    });

    it("should refuse a URL where a canonical path belongs, and switch language through parse()", () => {
      const routing = create();

      expect(() => routing.localize("/pt/sobre", "es")).toThrow(RangeError);
      expect(() => routing.localizeAll("/pt/sobre")).toThrow(RangeError);
      expect(routing.localize(routing.parse("/pt/sobre")!.pathname, "es")).toBe("/es/acerca");
    });

    // Burmese is `my`, and `/my/orders` is an English page no URL leads to: `/my/orders` is the Burmese `/orders`.
    it("should refuse a page whose path starts with a locale code rather than build another page's links", () => {
      const routing = createLocaleRouting({
        locales: ["en", "pt", "my"],
        defaultLocale: "en",
        localePrefix: "except-default",
      });

      expect(() => routing.localizeAll("/my/orders")).toThrow(RangeError);
      expect(routing.localizeAll("/orders").map(({ pathname }) => pathname)).toEqual([
        "/orders",
        "/pt/orders",
        "/my/orders",
      ]);
    });

    it("should localize a route pattern, so a router can register each locale's form", () => {
      const routing = create({ localePrefix: "when-ambiguous" });

      expect(routing.localizeAll("/products/:id")).toEqual([
        { locale: "en", pathname: "/products/:id" },
        { locale: "pt", pathname: "/produtos/:id" },
        { locale: "es", pathname: "/es/products/:id" },
      ]);
    });

    it("should match translated segments case-sensitively", () => {
      const routing = create();

      expect(routing.parse("/pt/Sobre")).toMatchObject({
        locale: "pt",
        pathname: "/Sobre",
      });
    });

    it.each(["except-default", "when-ambiguous", "always"] as const)(
      "should read a percent-encoded locale prefix as the locale it spells, with localePrefix %s",
      (localePrefix) => {
        const routing = create({ localePrefix });

        expect(routing.parse("/%70t/sobre")).toMatchObject({ locale: "pt", pathname: "/about" });
        expect(() => routing.localize("/%70t/sobre", "es")).toThrow(RangeError);
        // A leading locale after the prefix is refused, written plainly or percent-encoded.
        expect(routing.parse("/pt/en/about")).toBeUndefined();
        expect(routing.parse("/pt/%65n/about")).toBeUndefined();
      },
    );

    it("should write every segment it builds as a URL's pathname does, listed or not", () => {
      const routing = create({
        pathnames: { "/services": { pt: "/serviços" }, "/products/:id": { pt: "/produtos/:id" } },
      });

      expect(routing.localize("/services", "pt")).toBe("/pt/servi%C3%A7os");
      expect(routing.localize("/café", "pt")).toBe("/pt/caf%C3%A9");
      expect(routing.localize("/products/café", "pt")).toBe("/pt/produtos/caf%C3%A9");
      expect(routing.localize("/caf%c3%a9", "en")).toBe("/caf%C3%A9");
      expect(routing.parse("/pt/caf%C3%A9")?.alternates).toContainEqual({ locale: "en", pathname: "/caf%C3%A9" });
    });

    it("should match Unicode entries against percent-encoded paths and build encoded paths", () => {
      const routing = create({
        pathnames: { "/settings": { pt: "/configurações" } },
      });

      expect(routing.localize("/settings", "pt")).toBe("/pt/configura%C3%A7%C3%B5es");
      expect(routing.parse("/pt/configura%C3%A7%C3%B5es")).toMatchObject({
        locale: "pt",
        pathname: "/settings",
      });
      expect(routing.parse("/pt/configura%c3%a7%c3%b5es")).toMatchObject({
        locale: "pt",
        pathname: "/settings",
      });
    });

    it("should write a listed canonical word the same way in every locale, however the request encodes it", () => {
      const routing = create({ pathnames: { "/a/:q": { pt: "/b/:q" } } });

      expect(routing.parse("/%61/x")).toMatchObject({ locale: "en", pathname: "/a/x" });
      expect(routing.parse("/pt/%61/x")).toMatchObject({ locale: "pt", pathname: "/a/x" });
      expect(routing.parse("/es/%61/x")).toMatchObject({ locale: "es", pathname: "/a/x" });
    });

    it("should keep the trailing slash of a page whose translated path is the root", () => {
      const routing = create({ pathnames: { "/home": { pt: "/" } } });

      expect(routing.parse("/pt/")).toMatchObject({ locale: "pt", pathname: "/home/" });
      expect(routing.parse("/pt")).toMatchObject({ locale: "pt", pathname: "/home" });
    });

    it("should prefer a fixed segment over a parameter whatever the table order", () => {
      const routing = create({
        pathnames: {
          "/products/:id": { pt: "/produtos/:id" },
          "/products/new": { pt: "/produtos/novo" },
        },
      });

      expect(routing.parse("/pt/produtos/novo")).toMatchObject({
        locale: "pt",
        pathname: "/products/new",
      });
      expect(routing.parse("/pt/produtos/42")).toMatchObject({
        locale: "pt",
        pathname: "/products/42",
      });
      expect(routing.localize("/products/new", "pt")).toBe("/pt/produtos/novo");
    });

    const blogEntries = [
      ["/blog/:slug", { pt: "/artigos/:slug" }],
      ["/blog", { pt: "/artigos" }],
      ["/blog/archive", { pt: "/artigos/arquivo" }],
      ["/blog/:slug/:page*", { pt: "/artigos/:slug/:page*" }],
    ] as const;

    const permutations = (indexes: readonly number[]): number[][] =>
      indexes.length === 0
        ? [[]]
        : indexes.flatMap((index) =>
            permutations(indexes.filter((other) => other !== index)).map((rest) => [index, ...rest]),
          );

    it.each(permutations([0, 1, 2, 3]).map((order) => [order]))(
      "should prefer a fixed segment over a parameter with a shorter path listed between them, in order %j",
      (order) => {
        const routing = create({ pathnames: Object.fromEntries(order.map((index) => blogEntries[index]!)) });

        expect(routing.localize("/blog/archive", "pt")).toBe("/pt/artigos/arquivo");
        expect(routing.parse("/pt/artigos/arquivo")).toMatchObject({ locale: "pt", pathname: "/blog/archive" });
        expect(routing.localize("/blog/post", "pt")).toBe("/pt/artigos/post");
        expect(routing.localize("/blog/post/2", "pt")).toBe("/pt/artigos/post/2");
      },
    );

    it("should translate the default locale's paths too", () => {
      const routing = createLocaleRouting({
        defaultLocale: "pt",
        locales: ["pt", "en"] as const,
        localePrefix: "except-default",
        pathnames: { "/about": { pt: "/sobre" } },
      });

      expect(routing.localize("/about", "pt")).toBe("/sobre");
      expect(routing.localize("/about", "en")).toBe("/en/about");
      expect(routing.parse("/sobre")).toMatchObject({
        locale: "pt",
        pathname: "/about",
      });
    });

    it("should prefix translated paths for every locale with `always`", () => {
      const routing = create({ localePrefix: "always" });

      expect(routing.localize("/about", "en")).toBe("/en/about");
      expect(routing.localize("/about", "pt")).toBe("/pt/sobre");
      expect(routing.parse("/sobre")).toBeUndefined();
    });

    it("should redirect a path without a prefix by reading it in the chosen locale", () => {
      const routing = create({ localePrefix: "always" });
      const redirect = (pathname: string, locale: string) => {
        const guess = routing.parse(`/${locale}${pathname}`)!;
        return routing.localize(guess.pathname, guess.locale);
      };

      expect(redirect("/sobre", "pt")).toBe("/pt/sobre");
      expect(redirect("/about", "pt")).toBe("/pt/sobre");
      expect(redirect("/about", "en")).toBe("/en/about");
    });

    it("should match a translated segment that mixes Unicode with an escape that isn't UTF-8", () => {
      const routing = create({ pathnames: { "/about": { pt: "/café%C3" } } });

      expect(routing.parse("/pt/caf%C3%A9%C3")).toMatchObject({
        locale: "pt",
        pathname: "/about",
      });
      expect(routing.localize("/about", "pt")).toBe("/pt/caf%C3%A9%C3");
    });
  });

  describe("with `when-ambiguous`", () => {
    it("should drop the prefix from a translated path no other locale shares", () => {
      const routing = create({ localePrefix: "when-ambiguous" });

      expect(routing.localize("/about", "pt")).toBe("/sobre");
      expect(routing.localize("/products/42", "pt")).toBe("/produtos/42");
      expect(routing.parse("/sobre")).toMatchObject({
        locale: "pt",
        pathname: "/about",
      });
      expect(routing.parse("/produtos/42/")).toMatchObject({
        locale: "pt",
        pathname: "/products/42/",
      });
      expect(routing.parse("/acerca")).toMatchObject({
        locale: "es",
        pathname: "/about",
      });
    });

    it("should keep the prefix where the words are the same in another locale", () => {
      const routing = create({ localePrefix: "when-ambiguous" });

      expect(routing.localize("/", "pt")).toBe("/pt");
      expect(routing.localize("/blog", "pt")).toBe("/pt/blog");
      expect(routing.localize("/products/42", "es")).toBe("/es/products/42");
      expect(routing.parse("/blog")).toMatchObject({
        locale: "en",
        pathname: "/blog",
      });
      expect(routing.parse("/about")).toMatchObject({
        locale: "en",
        pathname: "/about",
      });
    });

    it("should keep the prefix when two locales translate a path to the same words", () => {
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: { "/contact": { pt: "/contato", es: "/contato" } },
      });

      expect(routing.localize("/contact", "pt")).toBe("/pt/contato");
      expect(routing.localize("/contact", "es")).toBe("/es/contato");
      expect(routing.parse("/contato")).toMatchObject({
        locale: "en",
        pathname: "/contato",
      });
    });

    it("should keep the prefix when the default locale's parameter could match the path", () => {
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: {
          "/about": { pt: "/sobre" },
          "/:slug": {},
        },
      });

      expect(routing.localize("/about", "pt")).toBe("/pt/sobre");
      expect(routing.parse("/sobre")).toMatchObject({
        locale: "en",
        pathname: "/sobre",
      });
    });

    it("should not compare a path with another locale's path that always keeps its prefix", () => {
      // Every Spanish tag URL is `/es/…`, and a path without a prefix is never read as Spanish, so `/sobre` is free.
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: {
          "/about": { pt: "/sobre" },
          "/tags/:tag": { es: "/:tag" },
        },
      });

      expect(routing.localize("/about", "pt")).toBe("/sobre");
      expect(routing.localize("/tags/sobre", "es")).toBe("/es/sobre");
      expect(routing.parse("/sobre")).toMatchObject({
        locale: "pt",
        pathname: "/about",
      });
      expect(routing.parse("/es/sobre")).toMatchObject({
        locale: "es",
        pathname: "/tags/sobre",
      });
    });

    it("should not compare a path with another locale's path that the default locale's paths keep prefixed", () => {
      // The Spanish `/c/:x` overlaps the English `/c/d`, so it keeps `/es`, and no longer stands in the way of `/:y/e`.
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: {
          "/c/d": {},
          "/a/b/:x": { es: "/c/:x" },
          "/b/z/:y": { pt: "/:y/e" },
        },
      });

      expect(routing.localize("/a/b/1", "es")).toBe("/es/c/1");
      expect(routing.localize("/b/z/c", "pt")).toBe("/c/e");
      expect(routing.parse("/c/e")).toMatchObject({
        locale: "pt",
        pathname: "/b/z/c",
      });
      expect(routing.parse("/c/d")).toMatchObject({
        locale: "en",
        pathname: "/c/d",
      });
    });

    it("should keep the prefix on both of two translated paths that overlap, whatever their order", () => {
      for (const pathnames of [
        { "/a/a/:x": { pt: "/p/:x" }, "/b/b/:y": { es: "/:y/q" } },
        { "/b/b/:y": { es: "/:y/q" }, "/a/a/:x": { pt: "/p/:x" } },
      ]) {
        const routing = create({ localePrefix: "when-ambiguous", pathnames });

        expect(routing.localize("/a/a/1", "pt")).toBe("/pt/p/1");
        expect(routing.localize("/b/b/1", "es")).toBe("/es/1/q");
      }
    });

    it("should keep the prefix on a translated path made only of parameters", () => {
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: { "/tags/:tag": { es: "/:tag" } },
      });

      expect(routing.localize("/tags/rojo", "es")).toBe("/es/rojo");
      expect(routing.parse("/rojo")).toMatchObject({
        locale: "en",
        pathname: "/rojo",
      });
    });

    it("should drop the prefix from a translated path that starts with a parameter", () => {
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: { "/items/:slug/details": { pt: "/:slug/artigo/itens" } },
      });

      expect(routing.localize("/items/mesa/details", "pt")).toBe("/mesa/artigo/itens");
      expect(routing.parse("/mesa/artigo/itens")).toMatchObject({
        locale: "pt",
        pathname: "/items/mesa/details",
      });
      // A slug that is a locale would make the path read as that locale's.
      expect(() => routing.localize("/items/en/details", "pt")).toThrow(RangeError);
    });

    it("should still accept the prefixed form of an unprefixed path", () => {
      const routing = create({ localePrefix: "when-ambiguous" });

      expect(routing.parse("/pt/sobre")).toMatchObject({
        locale: "pt",
        pathname: "/about",
      });
      expect(routing.localize(routing.parse("/pt/sobre")!.pathname, "pt")).toBe("/sobre");
    });

    it("should behave like `except-default` without a table", () => {
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: undefined,
      });

      expect(routing.localize("/about", "en")).toBe("/about");
      expect(routing.localize("/about", "pt")).toBe("/pt/about");
      expect(routing.parse("/about")).toMatchObject({
        locale: "en",
        pathname: "/about",
      });
    });
  });

  describe("when a path would be read back as another page", () => {
    it("should throw instead of building a link to the wrong page", () => {
      const ambiguous = create({ localePrefix: "when-ambiguous" });
      const prefixed = create();

      // An English page the table doesn't list, whose path is the Portuguese about page.
      expect(() => ambiguous.localize("/sobre", "en")).toThrow(RangeError);
      expect(() => ambiguous.localizeAll("/sobre")).toThrow(RangeError);
      expect(() => ambiguous.localize("/sobre", "en")).toThrow(/^\[I18n\] "\/sobre" in "en" would be read as /);
      // A page that keeps its words in Portuguese, colliding with a translated path.
      expect(() => prefixed.localize("/sobre", "pt")).toThrow(RangeError);
      expect(prefixed.localize("/sobre", "en")).toBe("/sobre");
    });

    it("should name the clashing URL and the page it opens, for a URL or a canonical path alike", () => {
      const routing = create({
        pathnames: {
          "/products/:id": { pt: "/produtos/:id" },
          "/products/new": { pt: "/produtos/novo" },
        },
      });
      // A real English product "novo", passed exactly as parse() returns it.
      const route = routing.parse("/products/novo")!;

      expect(() => routing.localize(route.pathname, "pt")).toThrow(
        new RangeError(
          '[I18n] "/products/novo" in "pt" would be read as "/products/new" in "pt"; its URL there, ' +
            '"/pt/produtos/novo", is that page\'s. If "/products/novo" is a URL, pass parse(url).pathname instead; if ' +
            'it is a canonical path, give one of the pages other words or list "/products/novo" in pathnames, and ' +
            "build a request's links from parse(url).alternates, which leaves such a locale out",
        ),
      );
    });

    it("should escape line separators and cut long paths in the message", () => {
      const words = ` ${"x".repeat(150)}`;
      const routing = create({ localePrefix: "when-ambiguous", pathnames: { "/about": { pt: `/${words}` } } });
      let message = "";
      try {
        routing.localize(`/${words}`, "en");
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toMatch(/^\[I18n\] "\/(%E2%80%A8|\\u2028)x+"\.\.\. in "en" would be read as "\/about" in "pt"/);
      expect(message).not.toContain(" ");
      expect(message).not.toContain("x".repeat(100));
    });
  });

  describe("alternates", () => {
    it("should list the page's URL in every locale, in `locales` order", () => {
      const routing = create();

      expect(routing.parse("/pt/sobre")).toEqual({
        locale: "pt",
        pathname: "/about",
        alternates: [
          { locale: "en", pathname: "/about" },
          { locale: "pt", pathname: "/pt/sobre" },
          { locale: "es", pathname: "/es/acerca" },
        ],
      });
      expect(routing.parse("/pt/produtos/42/")?.alternates).toEqual(routing.localizeAll("/products/42/"));
    });

    it("should apply the trailing-slash policy, as localize does", () => {
      const routing = create({ trailingSlash: "always" });

      expect(routing.parse("/pt")?.alternates).toEqual([
        { locale: "en", pathname: "/" },
        { locale: "pt", pathname: "/pt/" },
        { locale: "es", pathname: "/es/" },
      ]);
    });

    it("should leave out a locale whose URL would open another page, where localize throws", () => {
      // An English product "novo", whose Portuguese URL is the new-product page.
      const products = createLocaleRouting({
        locales: ["en", "pt"] as const,
        defaultLocale: "en",
        localePrefix: "except-default",
        pathnames: {
          "/products/:id": { pt: "/produtos/:id" },
          "/products/new": { pt: "/produtos/novo" },
        },
      });
      // An English page `/sobre` the table doesn't list, whose Portuguese URL is the about page.
      const about = createLocaleRouting({
        locales: ["en", "pt"] as const,
        defaultLocale: "en",
        localePrefix: "except-default",
        pathnames: { "/about": { pt: "/sobre" } },
      });

      expect(products.parse("/products/novo")).toEqual({
        locale: "en",
        pathname: "/products/novo",
        alternates: [{ locale: "en", pathname: "/products/novo" }],
      });
      expect(() => products.localizeAll("/products/novo")).toThrow(RangeError);
      expect(about.parse("/sobre")).toEqual({
        locale: "en",
        pathname: "/sobre",
        alternates: [{ locale: "en", pathname: "/sobre" }],
      });
      expect(() => about.localizeAll("/sobre")).toThrow(RangeError);
    });

    it("should leave out a locale whose URL would read as another locale's page with `when-ambiguous`", () => {
      const routing = create({ localePrefix: "when-ambiguous" });

      // A Spanish page `/sobre` the table doesn't list: its English URL, `/sobre`, and its Portuguese one, `/pt/sobre`,
      // are both the Portuguese about page.
      expect(routing.parse("/es/sobre")?.alternates).toEqual([{ locale: "es", pathname: "/es/sobre" }]);
      expect(() => routing.localize("/sobre", "en")).toThrow(/would be read as "\/about" in "pt"/);
    });

    it("should leave out a locale whose URL would be longer than 8,192 characters", () => {
      const routing = create({
        pathnames: { "/b/:id": { pt: `/${"p".repeat(100)}/:id` } },
      });
      const id = "x".repeat(8_192 - "/es/b/".length);

      expect(routing.parse(`/es/b/${id}`)?.alternates).toEqual([
        { locale: "en", pathname: `/b/${id}` },
        { locale: "es", pathname: `/es/b/${id}` },
      ]);
    });

    it("should leave out a locale whose URL would be more than 100 segments", () => {
      const routing = create();
      const pathname = "/x".repeat(100);

      expect(routing.parse(pathname)?.alternates).toEqual([{ locale: "en", pathname }]);
    });
  });

  describe("when no URL leads to the path read", () => {
    it("should return undefined for a path whose remainder is another locale's URL", () => {
      for (const localePrefix of ["always", "except-default", "when-ambiguous"] as const) {
        const routing = create({ localePrefix });

        expect(routing.parse("/pt/en/sobre")).toBeUndefined();
        expect(routing.parse("/es/pt/acerca")).toBeUndefined();
      }
    });

    it("should return undefined for a default-locale path that is another locale's translated path", () => {
      const routing = create({ localePrefix: "when-ambiguous" });

      expect(routing.parse("/en/sobre")).toBeUndefined();
      expect(routing.parse("/en/acerca")).toBeUndefined();
    });

    it("should return undefined for a path that would start with a locale once its prefix is removed", () => {
      const routing = create();

      // localize() reads a leading locale as a prefix, so no canonical path starts with one.
      expect(routing.parse("/pt/en/about")).toBeUndefined();
      expect(routing.parse("/en/pt")).toBeUndefined();
      expect(routing.parse("/pt/about")).toMatchObject({
        locale: "pt",
        pathname: "/about",
      });
    });

    it("should return undefined for a path whose canonical URL would be longer than 8,192 characters", () => {
      const routing = create({ pathnames: { "/settings/:id": { pt: "/configurações/:id" } } });
      // The canonical URL writes the table's words percent-encoded, 10 characters longer than "configurações".
      const id = (length: number) => "x".repeat(length - "/pt/configurações/".length);

      expect(routing.parse(`/pt/configurações/${id(8_192)}`)).toBeUndefined();
      expect(routing.parse(`/pt/configurações/${id(8_182)}`)?.pathname).toBe(`/settings/${id(8_182)}`);
    });

    it("should return undefined for a path whose canonical path would be longer than 8,192 characters", () => {
      const canonicalWord = "a".repeat(100);
      const routing = create({ pathnames: { [`/${canonicalWord}/:id`]: { pt: "/b/:id" } } });
      const id = (length: number) => "x".repeat(length - `/${canonicalWord}/`.length);

      expect(routing.parse(`/pt/b/${id(8_193)}`)).toBeUndefined();
      expect(routing.parse(`/pt/b/${id(8_192)}`)).toMatchObject({
        locale: "pt",
        pathname: `/${canonicalWord}/${id(8_192)}`,
      });
    });

    it("should return undefined for a path whose returned canonical path would be longer than 8,192 characters", () => {
      // `url.pathname` leaves `|` raw, but the returned canonical path writes the table's `|` as `%7C`.
      const routing = create({ pathnames: { "/a||||b/:rest*": { pt: "/b/:rest*" } } });
      // A rest that makes the canonical path `length` characters long.
      const rest = (length: number) => "x".repeat(length - "/a%7C%7C%7C%7Cb/".length);

      expect(routing.parse(`/pt/a||||b/${rest(8_193)}`)).toBeUndefined();
      expect(routing.parse(`/pt/a||||b/${rest(8_192)}`)).toMatchObject({
        locale: "pt",
        pathname: `/a%7C%7C%7C%7Cb/${rest(8_192)}`,
      });
    });

    it("should return undefined for a catch-all path whose canonical path would be longer than 8,192 characters", () => {
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: { "/documentation/:path*": { pt: "/d/:path*" } },
      });
      // Segments of 200 characters, and a last one, that make the canonical path `length` characters long.
      const rest = (length: number) => {
        const restLength = length - "/documentation/".length;
        return `${`${"x".repeat(199)}/`.repeat(Math.floor(restLength / 200))}${"y".repeat(restLength % 200)}`;
      };

      expect(routing.parse(`/d/${rest(8_193)}`)).toBeUndefined();
      expect(routing.parse(`/d/${rest(8_192)}`)).toMatchObject({
        locale: "pt",
        pathname: `/documentation/${rest(8_192)}`,
      });
    });

    it("should return undefined for a path whose canonical path would be more than 100 segments", () => {
      const routing = create({ pathnames: { "/a/b/c/:rest*": { pt: "/c/:rest*" } } });

      expect(routing.parse(`/pt/c${"/x".repeat(98)}`)).toBeUndefined();
      expect(routing.parse(`/pt/c${"/x".repeat(97)}`)).toMatchObject({
        locale: "pt",
        pathname: `/a/b/c${"/x".repeat(97)}`,
      });
    });

    it("should give every parsed path a canonical URL that localize builds", () => {
      const longWord = "a".repeat(100);
      const pathnames = {
        ...PATHNAMES,
        [`/${longWord}/:id`]: { pt: "/b/:id" },
        "/documentation/:path*": { pt: "/d/:path*" },
      };
      const words = ["about", "sobre", "acerca", "products", "produtos", "42", "reviews", "en", "pt", "es", "PT", "x"];
      const paths = ["/"];
      // Paths whose canonical path is around the 8,192-character limit, with and without a prefix.
      for (const length of [8_080, 8_089, 8_090, 8_091, 8_150]) {
        paths.push(`/b/${"x".repeat(length)}`, `/pt/b/${"x".repeat(length)}`, `/pt/b/${"x".repeat(length)}/`);
      }
      // Catch-all paths around the 100-segment limit, with and without a prefix.
      for (const count of [96, 97, 98, 99]) {
        paths.push(
          `/d/${"x/".repeat(count)}y`,
          `/pt/d/${"x/".repeat(count)}y`,
          `/documentation/${"x/".repeat(count)}y`,
        );
      }
      for (const a of words) {
        paths.push(`/${a}`);
        for (const b of words) {
          paths.push(`/${a}/${b}`);
          for (const c of words) {
            paths.push(`/${a}/${b}/${c}`);
          }
        }
      }

      for (const localePrefix of ["always", "except-default", "when-ambiguous"] as const) {
        const routing = create({ localePrefix, pathnames });
        const failures = paths.filter((path) => {
          const route = routing.parse(path);
          try {
            if (route !== undefined) {
              routing.localize(route.pathname, route.locale);
            }
            return false;
          } catch {
            return true;
          }
        });
        expect({ localePrefix, failures }).toEqual({ localePrefix, failures: [] });
      }
    });

    // About 1,200 paths in 18 configurations take about 2 s alone, and twice that under a parallel run, near the 5 s
    // default.
    it("should settle the guide's canonical redirect in one hop, and read every alternate back as the same page", () => {
      const pathnames = {
        ...PATHNAMES,
        "/products/new": { pt: "/produtos/novo" },
        "/help/:path*": { pt: "/ajuda/:path*" },
      };
      // Locales, other spellings, and the words of pages whose URLs clash, such as an English product `novo`.
      const words = ["en", "pt", "PT", "%61bout", "about", "sobre", "acerca", "products", "produtos", "new", "novo"];
      const candidates = ["/"];
      for (const a of words) {
        candidates.push(`/${a}`);
        for (const b of [...words, "42", "ajuda"]) {
          candidates.push(`/${a}/${b}`);
        }
      }
      for (const a of ["en", "pt", "products", "produtos", "help", "ajuda"]) {
        for (const b of [...words, "ajuda"]) {
          for (const c of ["new", "novo", "42"]) {
            candidates.push(`/${a}/${b}/${c}`);
          }
        }
      }
      // What a request carries: `url.pathname`, in both trailing-slash spellings.
      const paths = [
        ...new Set(
          candidates
            .flatMap((path) => (path === "/" ? [path] : [path, `${path}/`]))
            .map((path) => new URL(path, "https://example.com").pathname),
        ),
      ];
      const settles = (pathname: string) => {
        const url = new URL("https://example.com/");
        url.pathname = pathname;
        return url.pathname === pathname;
      };
      const withoutSlash = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname);

      for (const localePrefix of ["always", "except-default", "when-ambiguous"] as const) {
        for (const trailingSlash of ["preserve", "always", "never"] as const) {
          for (const defaultLocale of ["en", "pt"] as const) {
            const routing = create({
              defaultLocale,
              localePrefix,
              trailingSlash,
              pathnames,
            });
            const failures: string[] = [];
            for (const path of paths) {
              const route = routing.parse(path);
              if (route === undefined) {
                continue;
              }
              const canonical = routing.localize(route.pathname, route.locale);
              const again = routing.parse(canonical);
              if (
                !settles(canonical) ||
                again?.locale !== route.locale ||
                withoutSlash(again.pathname) !== withoutSlash(route.pathname) ||
                routing.localize(again.pathname, again.locale) !== canonical
              ) {
                failures.push(`${path} -> ${canonical} -> ${JSON.stringify(again)}`);
              }
              if (!route.alternates.some((alternate) => alternate.locale === route.locale)) {
                failures.push(`${path}: no alternate in ${route.locale}`);
              }
              for (const alternate of route.alternates) {
                const read = routing.parse(alternate.pathname);
                if (
                  !settles(alternate.pathname) ||
                  read?.locale !== alternate.locale ||
                  withoutSlash(read.pathname) !== withoutSlash(route.pathname) ||
                  routing.localize(route.pathname, alternate.locale) !== alternate.pathname
                ) {
                  failures.push(`${path}: alternate ${JSON.stringify(alternate)} -> ${JSON.stringify(read)}`);
                }
              }
              // A locale is left out only where localize() refuses the page.
              for (const locale of LOCALES.filter((one) => !route.alternates.some((item) => item.locale === one))) {
                try {
                  failures.push(
                    `${path}: left out ${locale}, whose URL is ${routing.localize(route.pathname, locale)}`,
                  );
                } catch (error) {
                  if (!(error instanceof RangeError)) {
                    throw error;
                  }
                }
              }
            }
            expect({
              localePrefix,
              trailingSlash,
              defaultLocale,
              failures,
            }).toEqual({
              localePrefix,
              trailingSlash,
              defaultLocale,
              failures: [],
            });
          }
        }
      }
    }, 30_000);
  });

  describe("with a large table", () => {
    // A scan over every route of a first segment once took about 3.5 s for these tables, against about 0.1 s for the
    // index. That scan runs inside the index and calls nothing a test can count without an internal hook, so the bound
    // is time, set far above the index's cost so that a slow machine passes and a scan still fails.
    const maxMilliseconds = 2_000;

    it("should build and read 2,000 routes without scanning them", () => {
      const pathnames: Record<string, Partial<Record<Locale, string>>> = {};
      for (let index = 0; index < 2_000; index += 1) {
        pathnames[`/section${index}/:id/page${index}`] = {
          pt: `/secao${index}/:id/pagina${index}`,
          es: `/seccion${index}/:id/pagina${index}`,
        };
      }

      const start = performance.now();
      const routing = create({ localePrefix: "when-ambiguous", pathnames });
      for (let index = 0; index < 2_000; index += 1) {
        expect(routing.parse(`/secao${index}/7/pagina${index}`)).toMatchObject({
          locale: "pt",
          pathname: `/section${index}/7/page${index}`,
        });
      }

      expect(performance.now() - start).toBeLessThan(maxMilliseconds);
    });

    for (const localePrefix of ["except-default", "when-ambiguous"] as const) {
      it(`should build and read 2,000 routes under one first segment without scanning them with \`${localePrefix}\``, () => {
        const pathnames: Record<string, Partial<Record<Locale, string>>> = {};
        for (let index = 0; index < 2_000; index += 1) {
          pathnames[`/docs/page${index}`] = { pt: `/documentos/pagina${index}`, es: `/documentos/pagina-es${index}` };
        }

        const start = performance.now();
        const routing = create({ localePrefix, pathnames });
        for (let index = 0; index < 2_000; index += 1) {
          expect(routing.parse(`/pt/documentos/pagina${index}`)).toMatchObject({
            locale: "pt",
            pathname: `/docs/page${index}`,
          });
        }

        expect(performance.now() - start).toBeLessThan(maxMilliseconds);
      });
    }

    it("should build 20,000 routes whose forms start with a parameter without comparing each pair", () => {
      // Comparing each form with every first segment its parameter could match took about 9 s for this table; comparing
      // the forms by class takes about 0.35 s.
      const pathnames: Record<string, Partial<Record<Locale, string>>> = {};
      for (let index = 0; index < 20_000; index += 1) {
        pathnames[`/c${index}/:a`] = { pt: `/:a/k${index}` };
      }

      const start = performance.now();
      const routing = create({ localePrefix: "when-ambiguous", pathnames });

      expect(performance.now() - start).toBeLessThan(maxMilliseconds);
      // `/c7/k5` is both the Portuguese `/:a/k5` and the English `/c7/:a`, so the prefix stays.
      expect(routing.localize("/c5/x", "pt")).toBe("/pt/x/k5");
    });

    it("should build and read a route as long as a request may be, next to a catch-all it overlaps", () => {
      // 99 segments, so the prefixed request is just within the 100-segment limit.
      const long = "/x".repeat(99);
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: { [long]: { pt: long }, "/a/:rest*": { pt: "/x/:rest*" } },
      });

      expect(routing.parse(`/pt${long}`)).toMatchObject({ locale: "pt", pathname: long });
    });
  });

  describe("catch-all parameters", () => {
    const docs = {
      "/docs": { pt: "/documentos" },
      "/docs/:path*": { pt: "/documentos/:path*" },
      "/docs/intro": { pt: "/documentos/introducao" },
    };

    it("should match one or more segments and copy them across", () => {
      const routing = create({ pathnames: docs });

      expect(routing.localize("/docs/guides/setup", "pt")).toBe("/pt/documentos/guides/setup");
      expect(routing.parse("/pt/documentos/guides/setup")).toMatchObject({
        locale: "pt",
        pathname: "/docs/guides/setup",
      });
      expect(routing.parse("/pt/documentos/a")).toMatchObject({ locale: "pt", pathname: "/docs/a" });
      expect(routing.parse("/pt/documentos/a/b/")).toMatchObject({ locale: "pt", pathname: "/docs/a/b/" });
    });

    it("should not match zero segments", () => {
      const routing = create({ pathnames: { "/docs/:path*": { pt: "/documentos/:path*" } } });

      expect(routing.localize("/docs", "pt")).toBe("/pt/docs");
      expect(routing.parse("/pt/documentos")).toMatchObject({ locale: "pt", pathname: "/documentos" });
    });

    it("should rank a fixed segment, then a parameter, ahead of a catch-all", () => {
      const routing = create({
        pathnames: { ...docs, "/docs/:section/:page": { pt: "/documentos/secao/:section/:page" } },
      });

      expect(routing.localize("/docs/intro", "pt")).toBe("/pt/documentos/introducao");
      expect(routing.localize("/docs/a/b", "pt")).toBe("/pt/documentos/secao/a/b");
      expect(routing.localize("/docs/a/b/c", "pt")).toBe("/pt/documentos/a/b/c");
      expect(routing.parse("/pt/documentos/introducao")?.pathname).toBe("/docs/intro");
    });

    it("should rank a fixed first segment ahead of a parameter, whatever comes after", () => {
      const routing = create({
        pathnames: { "/:a/:b": { pt: "/x/:a/:b" }, "/docs/:path*": { pt: "/documentos/:path*" } },
      });

      expect(routing.localize("/docs/a", "pt")).toBe("/pt/documentos/a");
      expect(routing.localize("/blog/a", "pt")).toBe("/pt/x/blog/a");
    });

    it("should translate a route pattern with a catch-all", () => {
      const routing = create({ pathnames: docs });

      expect(routing.localizeAll("/docs/:path*")).toEqual([
        { locale: "en", pathname: "/docs/:path*" },
        { locale: "pt", pathname: "/pt/documentos/:path*" },
        { locale: "es", pathname: "/es/docs/:path*" },
      ]);
    });

    it("should translate a catch-all route pattern through a catch-all, not a parameter that matches one segment", () => {
      const routing = create({
        localePrefix: "always",
        pathnames: {
          "/help/:id": { pt: "/ajuda/artigo/:id" },
          "/help/:path*": { pt: "/ajuda/:path*" },
        },
      });

      expect(routing.localizeAll("/help/:path*")).toEqual([
        { locale: "en", pathname: "/en/help/:path*" },
        { locale: "pt", pathname: "/pt/ajuda/:path*" },
        { locale: "es", pathname: "/es/help/:path*" },
      ]);
      expect(routing.localizeAll("/help/:id")).toEqual([
        { locale: "en", pathname: "/en/help/:id" },
        { locale: "pt", pathname: "/pt/ajuda/artigo/:id" },
        { locale: "es", pathname: "/es/help/:id" },
      ]);
      // The pattern each locale registers matches the URLs `parse` reads as that route.
      expect(routing.parse("/pt/ajuda/a/b")).toMatchObject({
        locale: "pt",
        pathname: "/help/a/b",
      });
      expect(routing.parse("/pt/ajuda/a/b")?.alternates).toContainEqual({
        locale: "pt",
        pathname: "/pt/ajuda/a/b",
      });
      expect(routing.parse("/pt/ajuda/artigo/a")).toMatchObject({
        locale: "pt",
        pathname: "/help/a",
      });
    });

    it("should read a catch-all route pattern back through the catch-all", () => {
      // The Portuguese `/b/:path*` and `/b/:id` overlap; `/pt/b/:path*` is the catch-all's pattern, not an article.
      const routing = create({
        pathnames: {
          "/articles/:id": { pt: "/b/:id" },
          "/docs/:path*": { pt: "/b/:path*" },
        },
      });

      expect(routing.localize("/docs/:path*", "pt")).toBe("/pt/b/:path*");
      expect(routing.parse("/pt/b/:path*")).toMatchObject({
        locale: "pt",
        pathname: "/docs/:path*",
      });
      expect(routing.localize("/articles/:id", "pt")).toBe("/pt/b/:id");
      expect(routing.localize("/docs/a/b", "pt")).toBe("/pt/b/a/b");
    });

    it("should keep the words of a catch-all route pattern the table lists no catch-all for", () => {
      const routing = create({
        pathnames: { "/help/:id": { pt: "/ajuda/:id" } },
      });

      // `/help/a/b` is unlisted, so its Portuguese URL keeps the English words, and the pattern does too.
      expect(routing.localize("/help/:path*", "pt")).toBe("/pt/help/:path*");
      expect(routing.localize("/help/a/b", "pt")).toBe("/pt/help/a/b");
      expect(routing.localize("/help/:id", "pt")).toBe("/pt/ajuda/:id");
    });

    it("should drop the prefix with `when-ambiguous` when no other locale's path overlaps", () => {
      const routing = create({ localePrefix: "when-ambiguous", pathnames: docs });

      expect(routing.localize("/docs/a/b", "pt")).toBe("/documentos/a/b");
      expect(routing.parse("/documentos/a/b")).toMatchObject({ locale: "pt", pathname: "/docs/a/b" });
      expect(routing.parse("/docs/a/b")).toMatchObject({ locale: "en", pathname: "/docs/a/b" });
    });

    it("should keep the prefix with `when-ambiguous` when another locale's path overlaps", () => {
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: {
          "/docs/:path*": { pt: "/documentos/:path*" },
          "/files/:id/:name": { es: "/documentos/:id/:name" },
        },
      });

      // The prefix is kept for the whole route, since its URLs of three segments could be Spanish.
      expect(routing.localize("/docs/a", "pt")).toBe("/pt/documentos/a");
      expect(routing.localize("/docs/a/b", "pt")).toBe("/pt/documentos/a/b");
      expect(routing.localize("/files/1/x", "es")).toBe("/es/documentos/1/x");
    });

    it("should reject a catch-all that is not last, or that differs between forms", () => {
      const invalid = (pathnames: unknown) => () =>
        create({ pathnames: pathnames as LocaleRoutingConfig<Locale>["pathnames"] });

      expect(invalid({ "/docs/:path*/edit": {} })).toThrow('pathnames["/docs/:path*/edit"]: Must put a catch-all last');
      expect(invalid({ "/docs/:path*": { pt: "/documentos/:path" } })).toThrow(
        'pathnames["/docs/:path*"].pt: Must use the parameters :path*',
      );
      expect(invalid({ "/docs/:path": { pt: "/documentos/:path*" } })).toThrow("Must use the parameters :path");
      expect(invalid({ "/docs/:a*": {}, "/docs/:b*": {} })).toThrow(
        'Must not have the same path as "/docs/:a*" in "en"',
      );
      expect(invalid({ "/docs/:*": {} })).toThrow("Must name each parameter");
    });
  });

  describe("configuration", () => {
    const invalid =
      (pathnames: unknown, localePrefix: LocaleRoutingConfig<Locale>["localePrefix"] = "except-default") =>
      () =>
        create({
          localePrefix,
          pathnames: pathnames as LocaleRoutingConfig<Locale>["pathnames"],
        });

    it("should require a plain object of plain objects of pathnames", () => {
      expect(invalid([])).toThrow("pathnames: Expected object, received array");
      expect(invalid({ "/about": "/sobre" })).toThrow('pathnames["/about"]: Expected object, received "/sobre"');
      expect(invalid({ "/about": { pt: 1 } })).toThrow('pathnames["/about"].pt: Expected string, received number');
    });

    it("should name an invalid pathname", () => {
      expect(invalid({ about: { pt: "/sobre" } })).toThrow('pathnames["about"]: Must start with /');
      expect(invalid({ "/about": { pt: "/sobre?x" } })).toThrow(
        'pathnames["/about"].pt: Must not contain ?, which starts a query',
      );
      expect(invalid({ "/about": { pt: "/sobre//x" } })).toThrow(
        'pathnames["/about"].pt: Must not contain an empty segment, as // makes',
      );
      expect(invalid({ "/about": { pt: "/../sobre" } })).toThrow(
        'pathnames["/about"].pt: Must not contain a dot segment, . or ..',
      );
    });

    it("should reject an unsupported or repeated locale", () => {
      expect(invalid({ "/about": { fr: "/a-propos" } })).toThrow(
        'pathnames["/about"].fr: Must match a configured locale',
      );
      expect(invalid({ "/about": { pt: "/sobre", PT: "/sobre" } })).toThrow(
        'pathnames["/about"].PT: Must be unique, ignoring letter case',
      );
    });

    it("should reject a path whose first segment is a locale", () => {
      expect(invalid({ "/pt/about": { es: "/acerca" } })).toThrow(
        'pathnames["/pt/about"]: Must not start with a locale',
      );
      expect(invalid({ "/about": { es: "/PT/acerca" } })).toThrow(
        'pathnames["/about"].es: Must not start with a locale',
      );
      expect(invalid({ "/about": { es: "/%70t/acerca" } })).toThrow(
        'pathnames["/about"].es: Must not start with a locale',
      );
    });

    it("should reject parameters that differ from the canonical path's", () => {
      expect(invalid({ "/products/:id": { pt: "/produtos/:slug" } })).toThrow(
        'pathnames["/products/:id"].pt: Must use the parameters :id',
      );
      expect(invalid({ "/products/:id": { pt: "/produtos" } })).toThrow("Must use the parameters :id");
      expect(invalid({ "/products/:id/:id": {} })).toThrow(
        'pathnames["/products/:id/:id"]: Must not repeat a parameter',
      );
      expect(invalid({ "/products/:": {} })).toThrow('pathnames["/products/:"]: Must name each parameter');
      expect(invalid({ "/products/:__proto__": {} })).toThrow("Must name each parameter");
    });

    it("should reject two pages that would have the same path in one locale", () => {
      expect(invalid({ "/about": { pt: "/sobre" }, "/company": { pt: "/sobre" } })).toThrow(
        'pathnames["/company"].pt: Must not have the same path as "/about" in "pt"',
      );
      // `/about` keeps its words in Spanish, so `/contact` can't use them.
      expect(invalid({ "/about": { pt: "/sobre" }, "/contact": { es: "/about" } })).toThrow(
        'pathnames["/contact"].es: Must not have the same path as "/about" in "es"',
      );
      expect(invalid({ "/products/:id": {}, "/products/:slug": {} })).toThrow(
        'pathnames["/products/:slug"]: Must not have the same path as "/products/:id" in "en"',
      );
    });

    it("should reject two canonical paths of the same shape even when every locale translates them", () => {
      expect(
        invalid({
          "/products/:id": { en: "/items/:id", pt: "/produtos/:id", es: "/productos/:id" },
          "/products/:slug": { en: "/goods/:slug", pt: "/bens/:slug", es: "/bienes/:slug" },
        }),
      ).toThrow('pathnames["/products/:slug"]: Must not be the same path as "/products/:id"');
    });

    it("should escape line separators and cut a long path in the clash message", () => {
      const long = `/a ${"b".repeat(150)}`;
      let message = "";
      try {
        invalid({ [long]: { pt: "/sobre" }, "/company": { pt: "/sobre" } })();
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain(`Must not have the same path as "/a\\u2028${"b".repeat(97)}"... in "pt"`);
      expect(message).not.toContain(" ");
    });

    it("should reject parameters in a form when the canonical path has none", () => {
      expect(invalid({ "/about": { pt: "/sobre/:x" } })).toThrow('pathnames["/about"].pt: Must not use parameters');
    });

    it("should snapshot the table", () => {
      const pathnames: Record<string, Record<string, string>> = {
        "/about": { pt: "/sobre" },
      };
      const routing = create({ pathnames });

      pathnames["/about"]!["pt"] = "/acerca";
      pathnames["/blog"] = { pt: "/diario" };

      expect(routing.localize("/about", "pt")).toBe("/pt/sobre");
      expect(routing.localize("/blog", "pt")).toBe("/pt/blog");
    });

    it("should type the table's locales", () => {
      expect(() =>
        createLocaleRouting({
          defaultLocale: "en",
          locales: ["en", "pt"] as const,
          localePrefix: "always",
          // @ts-expect-error - "fr" is not a configured locale
          pathnames: { "/about": { fr: "/a-propos" } },
        }),
      ).toThrow(TypeError);
    });
  });
});
