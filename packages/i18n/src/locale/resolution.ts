import type { I18nConfig } from "../core/types";
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

const withoutUnset = <T extends object>(value: T | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(value ?? {}).filter(([, entry]) => entry !== undefined)) as Partial<T>;

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
    loadLocale: config.loadLocale,
    getLocaleDirection: config.getLocaleDirection,
    isSilent: validated.isSilent ?? false,
    dictionaryLimits: Object.freeze({ ...DEFAULT_DICTIONARY_LIMITS, ...withoutUnset(validated.dictionaryLimits) }),
  };
}
