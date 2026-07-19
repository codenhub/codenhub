// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createI18n, type I18n, type I18nConfig } from "../../src";
import { createLocaleRouting } from "../../src/routing";

const LOCALES = ["en", "pt", "ar"] as const;
type Locale = (typeof LOCALES)[number];

const dictionaries = {
  en: { page: { title: "Welcome", description: "Learn more" } },
  pt: { page: { title: "Bem-vindo" } },
  ar: { page: { title: "Ahlan" } },
} as const;

interface ControlledConfig {
  readonly config: I18nConfig<Locale>;
  resolvePending(locale: Locale): void;
}

const createControlledConfig = (): ControlledConfig => {
  const pendingLoads = new Map<Locale, Set<(dictionary: unknown) => void>>();

  return {
    config: {
      defaultLocale: "en",
      locales: LOCALES,
      loadLocale(locale) {
        return new Promise((resolve) => {
          const resolvers = pendingLoads.get(locale) ?? new Set();
          resolvers.add(resolve);
          pendingLoads.set(locale, resolvers);
        });
      },
      getLocaleDirection: (locale) => (locale === "ar" ? "rtl" : "ltr"),
    },
    resolvePending(locale) {
      const resolvers = pendingLoads.get(locale);

      if (resolvers === undefined) {
        throw new Error(`No pending load for locale "${locale}".`);
      }

      pendingLoads.delete(locale);
      for (const resolve of resolvers) {
        resolve(dictionaries[locale]);
      }
    },
  };
};

interface RenderedPage {
  readonly locale: Locale;
  readonly direction: "ltr" | "rtl";
  readonly title: string | undefined;
  readonly description: string | undefined;
}

const renderRequest = async (config: I18nConfig<Locale>, locale: Locale): Promise<RenderedPage> => {
  const i18n = createI18n(config);
  await i18n.init({ locale });

  return {
    locale: i18n.locale,
    direction: i18n.direction,
    title: i18n.translate("page.title"),
    description: i18n.translate("page.description"),
  };
};

const initializeRenderInstance = async (config: I18nConfig<Locale>, locale: Locale): Promise<I18n<Locale>> => {
  const i18n = createI18n(config);
  await i18n.init({ locale });
  return i18n;
};

describe("server rendering", () => {
  it("renders concurrent SSR requests with deterministic locale, direction, translations, and fallback", async () => {
    const controlled = createControlledConfig();
    const rendering = Promise.all([
      renderRequest(controlled.config, "pt"),
      renderRequest(controlled.config, "ar"),
      renderRequest(controlled.config, "en"),
    ]);

    controlled.resolvePending("ar");
    controlled.resolvePending("pt");
    controlled.resolvePending("en");
    const pages = await rendering;

    expect(pages).toEqual([
      {
        locale: "pt",
        direction: "ltr",
        title: "Bem-vindo",
        description: "Learn more",
      },
      {
        locale: "ar",
        direction: "rtl",
        title: "Ahlan",
        description: "Learn more",
      },
      {
        locale: "en",
        direction: "ltr",
        title: "Welcome",
        description: "Learn more",
      },
    ]);
  });

  it("keeps active state owned by each concurrent SSR request instance", async () => {
    const controlled = createControlledConfig();
    const initializing = Promise.all([
      initializeRenderInstance(controlled.config, "pt"),
      initializeRenderInstance(controlled.config, "ar"),
    ]);

    controlled.resolvePending("ar");
    controlled.resolvePending("pt");
    controlled.resolvePending("en");
    const [portuguese, arabic] = await initializing;

    await portuguese.setLocale("en");

    expect(portuguese).toMatchObject({ locale: "en", direction: "ltr" });
    expect(portuguese.translate("page.title")).toBe("Welcome");
    expect(arabic).toMatchObject({ locale: "ar", direction: "rtl" });
    expect(arabic.translate("page.title")).toBe("Ahlan");
  });

  it("produces deterministic localized route output during parallel SSG renders", async () => {
    const controlled = createControlledConfig();
    const routing = createLocaleRouting({
      defaultLocale: "en",
      locales: LOCALES,
      prefixDefaultLocale: false,
    });
    const routes = routing.localizeAll("/about");

    const rendering = Promise.all(
      routes.map(async (route) => ({
        pathname: route.pathname,
        ...(await renderRequest(controlled.config, route.locale)),
      })),
    );

    controlled.resolvePending("ar");
    controlled.resolvePending("pt");
    controlled.resolvePending("en");
    const pages = await rendering;

    expect(pages).toEqual([
      {
        pathname: "/about",
        locale: "en",
        direction: "ltr",
        title: "Welcome",
        description: "Learn more",
      },
      {
        pathname: "/pt/about",
        locale: "pt",
        direction: "ltr",
        title: "Bem-vindo",
        description: "Learn more",
      },
      {
        pathname: "/ar/about",
        locale: "ar",
        direction: "rtl",
        title: "Ahlan",
        description: "Learn more",
      },
    ]);
  });
});
