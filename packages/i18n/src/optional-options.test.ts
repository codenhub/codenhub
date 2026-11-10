// @vitest-environment node
import { describe, expectTypeOf, it } from "vitest";

import type { BrowserI18nOptions } from "./browser";
import type { I18n, I18nConfig, I18nErrorOptions, I18nInitOptions, LocaleDictionaryLimits } from "./index";
import type { LocaleRoutingConfig } from "./routing";

// The package compiles with `exactOptionalPropertyTypes`, so these fail if an option stops accepting `undefined`,
// as forwarding a value that may be absent, such as `locale: route?.locale`, does.
describe("optional options", () => {
  it("should accept undefined for every optional option", () => {
    expectTypeOf<{
      locales: readonly ["en"];
      defaultLocale: "en";
      loadLocale: () => object;
      getLocaleDirection: undefined;
      onMissingKey: undefined;
      isSilent: undefined;
      timeZone: undefined;
      dictionaryLimits: undefined;
    }>().toExtend<I18nConfig<"en">>();
    expectTypeOf<{
      maxDepth: undefined;
      maxTranslations: undefined;
      maxProperties: undefined;
      maxValueLength: undefined;
      maxTotalLength: undefined;
    }>().toExtend<LocaleDictionaryLimits>();
    expectTypeOf<{ locale: undefined }>().toExtend<I18nInitOptions<"en">>();
    expectTypeOf<{ locale: undefined }>().toExtend<I18nErrorOptions>();
    expectTypeOf<{
      i18n: I18n<"en">;
      locale: undefined;
      storageKey: undefined;
      persistLocale: undefined;
      syncDocument: undefined;
      root: undefined;
      observe: undefined;
    }>().toExtend<BrowserI18nOptions<"en">>();
    expectTypeOf<{
      locales: readonly ["en"];
      defaultLocale: "en";
      localePrefix: "always";
      pathnames: undefined;
      trailingSlash: undefined;
    }>().toExtend<LocaleRoutingConfig<"en">>();
  });
});
