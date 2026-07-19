// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createI18n, type I18nConfig } from "../index";

describe("I18n initialization races", () => {
  it("does not let an invalid init cancel an earlier valid in-flight init", async () => {
    let resolveDictionary: ((dictionary: unknown) => void) | undefined;
    const dictionary = new Promise<unknown>((resolve) => {
      resolveDictionary = resolve;
    });
    const config: I18nConfig<"en"> = {
      defaultLocale: "en",
      locales: ["en"],
      loadLocale: vi.fn(() => dictionary),
      getLocaleDirection: () => "ltr",
    };
    const i18n = createI18n(config);
    const onReady = vi.fn();
    i18n.addEventListener("ready", onReady);

    const validInit = i18n.init();
    await expect(i18n.init({ locale: null as unknown as "en" })).rejects.toBeInstanceOf(RangeError);
    resolveDictionary?.({ greeting: "Hello" });
    await validInit;

    expect(i18n.isReady).toBe(true);
    expect(i18n.locale).toBe("en");
    expect(i18n.translate("greeting")).toBe("Hello");
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
