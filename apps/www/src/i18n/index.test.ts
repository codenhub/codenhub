import { pickArrivalLocale } from "@codenhub/app-shell/locales";
import { describe, expect, it, vi } from "vitest";

import { defaultLocale, getTranslator, locales, localeStaticPaths, routing, shellMessages } from ".";

describe("translations", () => {
  it("has a valid message under every key in every locale", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const checked = locales.map(async (locale) => {
      const translator = await getTranslator(locale);
      for (const key of Object.keys(await translator.loadLocale(locale))) {
        translator.t(key as Parameters<typeof translator.t>[0]);
      }
    });
    await Promise.all(checked);

    expect(warn.mock.calls.filter(([text]) => String(text).startsWith("[I18n] Invalid message"))).toEqual([]);
    warn.mockRestore();
  });

  it("leaves the shell's placeholders for the shell to fill", async () => {
    const translators = await Promise.all(locales.map(getTranslator));
    for (const { t } of translators) {
      const messages = shellMessages(t);

      expect(messages.home).toContain("{site}");
      expect(messages.search.empty).toContain("{query}");
      expect(messages.search.count.one).toContain("{count}");
      expect(messages.search.count.other).toContain("{count}");
    }
  });
});

// The arrival redirect (`@codenhub/app-shell/components/locale-redirect.astro`)
// matches by language alone; with one locale per language that is what the
// manager's `matchLocale` picks.
describe("pickArrivalLocale", () => {
  it.each([
    [["pt-BR"]],
    [["pt-PT", "en"]],
    [["pt"]],
    [["es-MX"]],
    [["ES"]],
    [["fr-FR", "es-419", "en"]],
    [["en-GB", "pt-BR"]],
    [["de", "fr"]],
    [[]],
  ])("picks what the manager's matchLocale picks for %j", async (preferences) => {
    const { matchLocale } = await getTranslator(defaultLocale);

    expect(pickArrivalLocale(null, preferences, locales)).toBe(matchLocale(preferences));
  });
});

describe("localeStaticPaths", () => {
  it("builds the default locale at the root and the others under their prefix", () => {
    expect(localeStaticPaths().map(({ params }) => params.locale)).toEqual([undefined, "pt-BR", "es"]);
    expect(routing.localize("/packages/", "pt-BR")).toBe("/pt-BR/packages/");
    expect(routing.localize("/packages/", "en")).toBe("/packages/");
  });
});
