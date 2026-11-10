// @vitest-environment node
import { describe, expect, it } from "vitest";

import { matchConfiguredLocale } from "./matching";

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
});
