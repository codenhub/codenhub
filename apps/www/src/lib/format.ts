const dateFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * Formats a release date the same way everywhere on the site.
 * @param date ISO 8601 date, as release history records it.
 * @param locale The page's locale. Defaults to English.
 * @returns Such as `Oct 9, 2026`, or `9 de out. de 2026` in `pt-BR`.
 */
export function formatDate(date: string, locale = "en"): string {
  let format = dateFormats.get(locale);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" });
    dateFormats.set(locale, format);
  }

  return format.format(new Date(date));
}
