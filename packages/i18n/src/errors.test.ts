// @vitest-environment node
import { describe, expect, it } from "vitest";

import { I18nError, i18nErrors } from "./errors";

describe("I18nError", () => {
  it("preserves the locale, stable code, and loader cause", () => {
    const cause = new Error("network unavailable");
    const error = new I18nError({ locale: "pt-BR", cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("I18nError");
    expect(error.message).toBe('Failed to load translations for locale "pt-BR".');
    expect(error.code).toBe("locale_load_failed");
    expect(error.locale).toBe("pt-BR");
    expect(error.cause).toBe(cause);
  });

  it("exports deterministic safe feedback for loader failures", () => {
    expect(i18nErrors).toEqual({
      locale_load_failed: {
        message: "Translations could not be loaded.",
        messageKey: "error.i18n.loader.localeLoadFailed",
        source: "i18n.loader",
      },
    });
  });
});
