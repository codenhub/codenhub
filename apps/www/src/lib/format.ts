const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" });

/**
 * Formats a release date the same way everywhere on the site.
 * @param date ISO 8601 date, as release history records it.
 * @returns Such as `Oct 9, 2026`.
 */
export function formatDate(date: string): string {
  return dateFormat.format(new Date(date));
}
