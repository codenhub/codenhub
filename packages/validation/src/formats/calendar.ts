/** Tests whether `YYYY-MM-DD` names a day that exists, rejecting `2026-02-30`. */
export const isCalendarDate = (text: string): boolean => {
  const [year, month, day] = text.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
