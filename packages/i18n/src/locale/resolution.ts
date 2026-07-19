import type { I18nConfig } from "../core/types";
import { isValidLocaleIdentifier } from "./identifier";

/** Validated runtime-neutral configuration used by core internals. */
export interface ValidatedI18nConfig<TLocale extends string> {
  readonly defaultLocale: TLocale;
  readonly locales: readonly TLocale[];
  readonly loadLocale: I18nConfig<TLocale>["loadLocale"];
  readonly getLocaleDirection: I18nConfig<TLocale>["getLocaleDirection"];
  readonly isSilent: boolean;
}

/**
 * Resolves an untrusted locale value to its configured canonical spelling.
 *
 * @param locales - Canonical supported locales.
 * @param value - Untrusted locale value.
 * @returns The canonical locale, or undefined when unsupported.
 * @internal
 */
export function resolveConfiguredLocale<TLocale extends string>(
  locales: readonly TLocale[],
  value: string,
): TLocale | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue.length === 0) {
    return undefined;
  }

  return locales.find((locale) => locale.toLowerCase() === normalizedValue);
}

/**
 * Copies locale metadata before it enters a manager instance.
 *
 * @param config - Consumer-provided configuration.
 * @returns The isolated configuration used by core internals.
 * @internal
 */
export function validateI18nConfig<TLocale extends string>(config: I18nConfig<TLocale>): ValidatedI18nConfig<TLocale> {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new TypeError("[I18n] configuration must be an object.");
  }

  if (!Array.isArray(config.locales)) {
    throw new TypeError("[I18n] locales must be an array.");
  }

  if (config.locales.length === 0) {
    throw new TypeError("[I18n] locales must not be empty.");
  }

  if (config.locales.some((locale) => typeof locale !== "string" || locale.trim().length === 0)) {
    throw new TypeError("[I18n] locales must contain non-empty strings.");
  }

  const locales = Object.freeze(config.locales.map((locale) => locale.trim() as TLocale));

  if (locales.some((locale) => !isValidLocaleIdentifier(locale))) {
    throw new TypeError("[I18n] locales must be ASCII locale identifiers with alphanumeric hyphen-separated subtags.");
  }

  const normalizedLocales = locales.map((locale) => locale.toLowerCase());

  if (new Set(normalizedLocales).size !== normalizedLocales.length) {
    throw new TypeError("[I18n] locales must be case-insensitively unique.");
  }

  const defaultLocale = resolveConfiguredLocale(locales, config.defaultLocale);

  if (defaultLocale === undefined) {
    throw new TypeError("[I18n] defaultLocale must match a configured locale.");
  }

  if (typeof config.loadLocale !== "function") {
    throw new TypeError("[I18n] loadLocale must be a function.");
  }

  if (typeof config.getLocaleDirection !== "function") {
    throw new TypeError("[I18n] getLocaleDirection must be a function.");
  }

  if (config.isSilent !== undefined && typeof config.isSilent !== "boolean") {
    throw new TypeError("[I18n] isSilent must be a boolean.");
  }

  return {
    defaultLocale,
    locales,
    loadLocale: config.loadLocale,
    getLocaleDirection: config.getLocaleDirection,
    isSilent: config.isSilent ?? false,
  };
}
