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

      expect(routing.parse("/pt/sobre")).toEqual({
        locale: "pt",
        pathname: "/about",
      });
      expect(routing.parse("/PT/produtos/42")).toEqual({
        locale: "pt",
        pathname: "/products/42",
      });
    });

    it("should keep the canonical words for a locale or path the table does not list", () => {
      const routing = create();

      expect(routing.localize("/products/42", "es")).toBe("/es/products/42");
      expect(routing.localize("/blog", "pt")).toBe("/pt/blog");
      expect(routing.parse("/es/products/42")).toEqual({
        locale: "es",
        pathname: "/products/42",
      });
      expect(routing.parse("/pt/blog")).toEqual({
        locale: "pt",
        pathname: "/blog",
      });
    });

    it("should move parameters to where each language puts them", () => {
      const routing = create();

      expect(routing.localize("/products/42/reviews/7", "pt")).toBe("/pt/avaliacoes/7/produto/42");
      expect(routing.parse("/pt/avaliacoes/7/produto/42")).toEqual({
        locale: "pt",
        pathname: "/products/42/reviews/7",
      });
    });

    it("should copy parameter values unchanged", () => {
      const routing = create();

      expect(routing.localize("/products/caf%C3%A9%20bar", "pt")).toBe("/pt/produtos/caf%C3%A9%20bar");
      expect(routing.parse("/pt/produtos/caf%c3%a9")).toEqual({
        locale: "pt",
        pathname: "/products/caf%c3%a9",
      });
    });

    it("should keep one trailing slash", () => {
      const routing = create();

      expect(routing.localize("/about/", "pt")).toBe("/pt/sobre/");
      expect(routing.parse("/pt/sobre/")).toEqual({
        locale: "pt",
        pathname: "/about/",
      });
    });

    it("should read a prefixed path as that locale's URL, so it can switch language", () => {
      const routing = create();

      expect(routing.localize("/pt/sobre", "es")).toBe("/es/acerca");
      expect(routing.localize("/pt/about", "pt")).toBe("/pt/sobre");
      expect(routing.localizeAll("/pt/sobre")).toEqual([
        { locale: "en", pathname: "/about" },
        { locale: "pt", pathname: "/pt/sobre" },
        { locale: "es", pathname: "/es/acerca" },
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

      expect(routing.parse("/pt/Sobre")).toEqual({
        locale: "pt",
        pathname: "/Sobre",
      });
    });

    it("should match Unicode entries against percent-encoded paths and build encoded paths", () => {
      const routing = create({
        pathnames: { "/settings": { pt: "/configurações" } },
      });

      expect(routing.localize("/settings", "pt")).toBe("/pt/configura%C3%A7%C3%B5es");
      expect(routing.parse("/pt/configura%C3%A7%C3%B5es")).toEqual({
        locale: "pt",
        pathname: "/settings",
      });
      expect(routing.parse("/pt/configura%c3%a7%c3%b5es")).toEqual({
        locale: "pt",
        pathname: "/settings",
      });
    });

    it("should prefer a fixed segment over a parameter whatever the table order", () => {
      const routing = create({
        pathnames: {
          "/products/:id": { pt: "/produtos/:id" },
          "/products/new": { pt: "/produtos/novo" },
        },
      });

      expect(routing.parse("/pt/produtos/novo")).toEqual({
        locale: "pt",
        pathname: "/products/new",
      });
      expect(routing.parse("/pt/produtos/42")).toEqual({
        locale: "pt",
        pathname: "/products/42",
      });
      expect(routing.localize("/products/new", "pt")).toBe("/pt/produtos/novo");
    });

    it("should translate the default locale's paths too", () => {
      const routing = createLocaleRouting({
        defaultLocale: "pt",
        locales: ["pt", "en"] as const,
        localePrefix: "except-default",
        pathnames: { "/about": { pt: "/sobre" } },
      });

      expect(routing.localize("/about", "pt")).toBe("/sobre");
      expect(routing.localize("/about", "en")).toBe("/en/about");
      expect(routing.parse("/sobre")).toEqual({
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

      expect(routing.localize("/pt/sobre", "pt")).toBe("/pt/sobre");
      expect(routing.localize("/pt/about", "pt")).toBe("/pt/sobre");
      expect(routing.localize("/en/about", "en")).toBe("/en/about");
    });

    it("should match a translated segment that mixes Unicode with an escape that isn't UTF-8", () => {
      const routing = create({ pathnames: { "/about": { pt: "/café%C3" } } });

      expect(routing.parse("/pt/caf%C3%A9%C3")).toEqual({
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
      expect(routing.parse("/sobre")).toEqual({
        locale: "pt",
        pathname: "/about",
      });
      expect(routing.parse("/produtos/42/")).toEqual({
        locale: "pt",
        pathname: "/products/42/",
      });
      expect(routing.parse("/acerca")).toEqual({
        locale: "es",
        pathname: "/about",
      });
    });

    it("should keep the prefix where the words are the same in another locale", () => {
      const routing = create({ localePrefix: "when-ambiguous" });

      expect(routing.localize("/", "pt")).toBe("/pt");
      expect(routing.localize("/blog", "pt")).toBe("/pt/blog");
      expect(routing.localize("/products/42", "es")).toBe("/es/products/42");
      expect(routing.parse("/blog")).toEqual({
        locale: "en",
        pathname: "/blog",
      });
      expect(routing.parse("/about")).toEqual({
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
      expect(routing.parse("/contato")).toEqual({
        locale: "en",
        pathname: "/contato",
      });
    });

    it("should keep the prefix when another locale's parameter could match the path", () => {
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: {
          "/about": { pt: "/sobre" },
          "/tags/:tag": { es: "/:tag" },
        },
      });

      expect(routing.localize("/about", "pt")).toBe("/pt/sobre");
    });

    it("should keep the prefix on a translated path made only of parameters", () => {
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: { "/tags/:tag": { es: "/:tag" } },
      });

      expect(routing.localize("/tags/rojo", "es")).toBe("/es/rojo");
      expect(routing.parse("/rojo")).toEqual({
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
      expect(routing.parse("/mesa/artigo/itens")).toEqual({
        locale: "pt",
        pathname: "/items/mesa/details",
      });
      // A slug that is a locale would make the path read as that locale's.
      expect(() => routing.localize("/items/en/details", "pt")).toThrow(RangeError);
    });

    it("should still accept the prefixed form of an unprefixed path", () => {
      const routing = create({ localePrefix: "when-ambiguous" });

      expect(routing.parse("/pt/sobre")).toEqual({
        locale: "pt",
        pathname: "/about",
      });
      expect(routing.localize("/pt/sobre", "pt")).toBe("/sobre");
    });

    it("should behave like `except-default` without a table", () => {
      const routing = create({
        localePrefix: "when-ambiguous",
        pathnames: undefined,
      });

      expect(routing.localize("/about", "en")).toBe("/about");
      expect(routing.localize("/about", "pt")).toBe("/pt/about");
      expect(routing.parse("/about")).toEqual({
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
      expect(routing.parse("/pt/about")).toEqual({
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

    it("should give every parsed path a canonical URL that localize builds", () => {
      const words = ["about", "sobre", "acerca", "products", "produtos", "42", "reviews", "en", "pt", "es", "PT", "x"];
      const paths = ["/"];
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
        const routing = create({ localePrefix });
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
  });

  describe("with a large table", () => {
    it("should build and read 2,000 routes in well under a second", () => {
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
        expect(routing.parse(`/secao${index}/7/pagina${index}`)).toEqual({
          locale: "pt",
          pathname: `/section${index}/7/page${index}`,
        });
      }

      expect(performance.now() - start).toBeLessThan(1_000);
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
      expect(invalid({ "/about": "/sobre" })).toThrow('pathnames["/about"]: Expected object, received string');
      expect(invalid({ "/about": { pt: 1 } })).toThrow('pathnames["/about"].pt: Expected string, received number');
    });

    it("should name an invalid pathname", () => {
      expect(invalid({ about: { pt: "/sobre" } })).toThrow(
        'pathnames["about"]: Must be a valid absolute application pathname',
      );
      expect(invalid({ "/about": { pt: "/sobre?x" } })).toThrow(
        'pathnames["/about"].pt: Must be a valid absolute application pathname',
      );
      expect(invalid({ "/about": { pt: "/../sobre" } })).toThrow(
        'pathnames["/about"].pt: Must not contain dot segments',
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
