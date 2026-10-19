import type { I18nConfig, LocaleDirection } from "../core/types";
import { assertConfig, i18nConfig } from "./config-validators";
import { resolveConfiguredLocale } from "./configured-locale";
import { DEFAULT_DICTIONARY_LIMITS, type DictionaryLimits } from "./dictionary";

/** Validated runtime-neutral configuration used by core internals. */
export interface ValidatedI18nConfig<TLocale extends string> {
  readonly defaultLocale: TLocale;
  readonly locales: readonly TLocale[];
  readonly loadLocale: I18nConfig<TLocale>["loadLocale"];
  readonly getLocaleDirection: I18nConfig<TLocale>["getLocaleDirection"];
  readonly isSilent: boolean;
  readonly dictionaryLimits: DictionaryLimits;
}

export { resolveConfiguredLocale } from "./configured-locale";

/**
 * Copies locale metadata before it enters a manager instance.
 *
 * @param config - Consumer-provided configuration.
 * @returns The isolated configuration used by core internals.
 * @internal
 */
export function validateI18nConfig<TLocale extends string>(config: I18nConfig<TLocale>): ValidatedI18nConfig<TLocale> {
  const validated = assertConfig(i18nConfig, config, "[I18n] Invalid configuration");
  const locales = Object.freeze(validated.locales as TLocale[]);

  return {
    defaultLocale: resolveConfiguredLocale(locales, validated.defaultLocale) as TLocale,
    locales,
    // Called with the consumer's configuration as `this`, as `config.loadLocale(locale)` would be.
    loadLocale: (locale) => Reflect.apply(validated.loadLocale, config, [locale]),
    getLocaleDirection: (locale) => Reflect.apply(validated.getLocaleDirection, config, [locale]) as LocaleDirection,
    isSilent: validated.isSilent ?? false,
    dictionaryLimits: Object.freeze({ ...DEFAULT_DICTIONARY_LIMITS, ...validated.dictionaryLimits }),
  };
}
