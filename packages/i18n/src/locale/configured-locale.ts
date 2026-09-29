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
