// @vitest-environment node
import { describe, expect, it } from "vitest";

import { matchConfiguredLocale, prepareLocales } from "./matching";

describe("matchConfiguredLocale", () => {
  it.each([
    [["es-419", "es-ES"], "es-419"],
    [["es-ES", "es-419"], "es-ES"],
  ] as const)("picks the first of %j for a region neither names, such as es-MX", (locales, expected) => {
    expect(matchConfiguredLocale(locales, ["es-MX"])).toBe(expected);
  });

  it("matches es-ES exactly when es-419 is listed first", () => {
    expect(matchConfiguredLocale(["es-419", "es-ES"], ["es-ES"])).toBe("es-ES");
  });

  it("matches es to es-ES, its likely region, when es-419 is listed first", () => {
    expect(matchConfiguredLocale(["es-419", "es-ES"], ["es"])).toBe("es-ES");
  });

  it.each([
    [["en", "zh-Hant"], ["zh"]],
    [["en", "zh"], ["zh-TW"]],
    [["en", "sr-Latn"], ["sr"]],
  ] as const)("does not match %j to %j, a language in another script", (locales, preferences) => {
    expect(matchConfiguredLocale(locales, preferences)).toBeUndefined();
  });

  it.each([
    [["zh-Hant-x-abcdefghijk"], ["zh-TW"], "zh-Hant-x-abcdefghijk"],
    [["zh-Hant-x-abcdefghijk"], ["zh-Hans-CN"], undefined],
    [["en-x-abcdefghijk"], ["en-GB"], "en-x-abcdefghijk"],
  ] as const)("matches %j, which Intl.Locale rejects, to %j by its named script", (locales, preferences, expected) => {
    expect(matchConfiguredLocale(locales, preferences)).toBe(expected);
  });

  it.each([
    [["en", "no"], ["nb"], "no"],
    [["en", "no"], ["nb-NO"], "no"],
    [["en", "nb"], ["no"], "nb"],
    [["en", "nb-NO"], ["no-NO"], "nb-NO"],
    [["en", "no-x-abcdefghijk"], ["nb"], "no-x-abcdefghijk"],
    [["en", "nb", "no"], ["no"], "no"],
    [["en", "nn"], ["no"], undefined],
    [["en", "no"], ["nn"], undefined],
    [["nb", "nb-NO"], ["no-NO-x-foo"], "nb-NO"],
    [["no", "nb"], ["nb-NO"], "nb"],
    [["nb", "no"], ["no-NO"], "no"],
  ] as const)("matches %j to %j as the same Norwegian, Bokmål, but not Nynorsk", (locales, preferences, expected) => {
    expect(matchConfiguredLocale(locales, preferences)).toBe(expected);
  });

  it("tries the next preference rather than a locale in another script", () => {
    expect(matchConfiguredLocale(["en", "zh"], ["zh-TW", "en"])).toBe("en");
  });

  it.each(["und", "UND", "und-US", "und-Latn"])("skips %s, which names no language, for the next preference", (tag) => {
    expect(matchConfiguredLocale(["en", "fr"], [tag, "fr"])).toBe("fr");
  });

  it.each([
    [["en", "es-419", "es-ES"], ["es-u-hc-h23"], "es-ES"],
    [["en-GB", "en-US"], ["en-u-hc-h23"], "en-US"],
    [["zh-HK", "zh-TW"], ["zh-Hant-u-ca-roc"], "zh-TW"],
    [["en", "es-419", "es-ES"], ["es-x-private"], "es-ES"],
  ] as const)("matches %j to %j by likely region, ignoring extensions", (locales, preferences, expected) => {
    expect(matchConfiguredLocale(locales, preferences)).toBe(expected);
  });

  it.each([
    [["nah"], ["nah-MX"], "nah"],
    [["en", "nah-MX"], ["nah-US"], "nah-MX"],
  ] as const)("matches %j to %j in a language with no likely script", (locales, preferences, expected) => {
    expect(matchConfiguredLocale(locales, preferences)).toBe(expected);
  });

  it.each([
    [["en", "he"], ["iw-IL"], "he"],
    [["en", "he"], ["iw"], "he"],
    [["en", "id"], ["in"], "id"],
    [["en", "fil"], ["tl"], "fil"],
    [["en", "ro"], ["mo"], "ro"],
  ] as const)("matches %j to %j, an old code of the same language", (locales, preferences, expected) => {
    expect(matchConfiguredLocale(locales, preferences)).toBe(expected);
  });

  it.each([
    [["en", "pt-BR"], ["pt_BR"], "pt-BR"],
    [["en", "pt"], ["pt_PT"], "pt"],
    [["en", "zh-Hant"], ["zh_Hant_TW"], "zh-Hant"],
  ] as const)("matches %j to %j, written with underscores", (locales, preferences, expected) => {
    expect(matchConfiguredLocale(locales, preferences)).toBe(expected);
  });

  // `Intl.Locale` parses a long run of variants in quadratic time, about 25 ms for one 16 KB `Accept-Language` tag.
  it("skips a preference longer than 255 characters, and matches one of 255", () => {
    const tagOfLength = (length: number) => `en-x-${"abcdefgh-".repeat(30)}`.slice(0, length - 1) + "z";

    expect(matchConfiguredLocale(["en", "fr"], [tagOfLength(256), "fr"])).toBe("fr");
    expect(matchConfiguredLocale(["en", "fr"], [tagOfLength(255), "fr"])).toBe("en");
  });

  it("computes each locale's forms once per list, as a manager keeps it", () => {
    const locales = Object.freeze(["en", "iw-IL", "no"]);
    const prepared = prepareLocales(locales);

    expect(matchConfiguredLocale(locales, ["he"])).toBe("iw-IL");
    expect(prepareLocales(locales)).toBe(prepared);
    expect(prepareLocales([...locales])).not.toBe(prepared);
    expect(prepared.entries.map(({ comparable }) => comparable)).toEqual(["en", "he-il", "nb"]);
  });
});
