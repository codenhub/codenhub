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

  it("tries the next preference rather than a locale in another script", () => {
    expect(matchConfiguredLocale(["en", "zh"], ["zh-TW", "en"])).toBe("en");
  });
});
