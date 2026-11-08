// @vitest-environment node
import { describe, expect, it } from "vitest";

import { getDefaultLocaleDirection } from "./direction";

describe("getDefaultLocaleDirection", () => {
  it.each(["pa-PK", "az-IR", "uz-AF", "ku-IQ", "kk-CN", "ha-SD"])(
    "resolves rtl for %s, whose region implies a right-to-left script",
    (locale) => {
      expect(getDefaultLocaleDirection(locale)).toBe("rtl");
    },
  );

  it.each(["prs", "arz", "ary", "apc", "ars", "aeb", "acm", "sdh", "bal", "glk", "skr", "lad", "rhg", "ji"])(
    "resolves rtl for the right-to-left language or dialect %s",
    (locale) => {
      expect(getDefaultLocaleDirection(locale)).toBe("rtl");
    },
  );

  it.each(["pa", "az", "uz", "ku", "kk", "ha", "en-PK", "sd-IN"])(
    "resolves ltr for %s, whose likely script is left-to-right",
    (locale) => {
      expect(getDefaultLocaleDirection(locale)).toBe("ltr");
    },
  );

  it.each([
    ["uz-Arab", "rtl"],
    ["pa-Guru-PK", "ltr"],
    ["sd-Arab-IN", "rtl"],
    ["ar-Latn", "ltr"],
  ])("lets the explicit script of %s win over its likely script", (locale, direction) => {
    expect(getDefaultLocaleDirection(locale)).toBe(direction);
  });

  it.each(["arc-Armi", "phn-Phnx", "hu-Hung", "sog-Sogd"])("resolves rtl for the historic script of %s", (locale) => {
    expect(getDefaultLocaleDirection(locale)).toBe("rtl");
  });

  it.each([
    ["en-u-nu-arab", "ltr"],
    ["uz-x-arab", "ltr"],
    ["he-x-latn", "rtl"],
  ])("ignores a script-like value after an extension or private-use singleton in %s", (locale, direction) => {
    expect(getDefaultLocaleDirection(locale)).toBe(direction);
  });

  it("falls back to the language list when Intl.Locale rejects the tag", () => {
    expect(getDefaultLocaleDirection("ar-x")).toBe("rtl");
  });
});
