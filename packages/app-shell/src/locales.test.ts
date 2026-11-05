import { describe, expect, it } from "vitest";

import { LOCALE_NAMES, localeCookie, localizePath, localizeUrl, pickArrivalLocale, SITE_LOCALES } from "./locales.ts";

describe("SITE_LOCALES", () => {
  it("lists English first, then every translation locale, each with a name", () => {
    expect(SITE_LOCALES).toEqual(["en", "pt-BR", "es"]);
    expect(Object.keys(LOCALE_NAMES).sort()).toEqual([...SITE_LOCALES].sort());
  });
});

describe("localizePath", () => {
  it("leaves English at the root and prefixes the rest", () => {
    expect(localizePath("en", "/packages/")).toBe("/packages/");
    expect(localizePath("pt-BR", "/packages/")).toBe("/pt-BR/packages/");
  });
});

describe("localizeUrl", () => {
  it("moves a URL under the locale's prefix, keeping its fragment", () => {
    expect(localizeUrl("https://docs.codenhub.dev/icons/changelog/#top", "pt-BR")).toBe(
      "https://docs.codenhub.dev/pt-BR/icons/changelog/#top",
    );
    expect(localizeUrl("https://docs.codenhub.dev/icons/", "en")).toBe("https://docs.codenhub.dev/icons/");
  });
});

describe("pickArrivalLocale", () => {
  it("prefers a saved choice the site has over the browser's languages", () => {
    expect(pickArrivalLocale("es", ["pt-BR"])).toBe("es");
    expect(pickArrivalLocale("en", ["pt-BR"])).toBe("en");
  });

  it("ignores a saved value the site does not have", () => {
    expect(pickArrivalLocale("fr", ["pt-PT"])).toBe("pt-BR");
  });

  it("matches the browser's languages by language alone", () => {
    expect(pickArrivalLocale(null, ["fr-FR", "ES-419", "en"])).toBe("es");
    expect(pickArrivalLocale(null, ["de"])).toBeUndefined();
  });
});

describe("localeCookie", () => {
  it("scopes the choice to the shared domain on any CodenHub host", () => {
    expect(localeCookie("pt-BR", "docs.codenhub.dev", "codenhub.dev")).toBe(
      "codenhub-locale=pt-BR; Path=/; Max-Age=31536000; SameSite=Lax; Domain=codenhub.dev",
    );
    expect(localeCookie("es", "codenhub.dev", "codenhub.dev")).toContain("; Domain=codenhub.dev");
  });

  it("keeps the choice to the current host elsewhere, where the domain would be rejected", () => {
    expect(localeCookie("es", "localhost", "codenhub.dev")).not.toContain("Domain");
    expect(localeCookie("es", "evilcodenhub.dev", "codenhub.dev")).not.toContain("Domain");
  });
});
