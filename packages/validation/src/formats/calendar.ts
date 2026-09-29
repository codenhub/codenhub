/** Tests whether `YYYY-MM-DD` names a day that exists, rejecting `2026-02-30`. */
export const isCalendarDate = (text: string): boolean => {
  const [year, month, day] = text.split("-").map(Number) as [number, number, number];
  const date = new Date(0);
  // Date.UTC reads the years 0 to 99 as 1900 to 1999, and setUTCFullYear does not.
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
