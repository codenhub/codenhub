import { isCalendarDate } from "./calendar";
import { formatFactory } from "./text-format";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Creates a validator for ISO 8601 calendar dates such as `2026-09-28`, on a day that exists. The
 * value is a string and is not modified; to get a `Date`, use `date`.
 *
 * @example
 * ```ts
 * isoDate()("2024-02-29"); // { ok: true, ... }
 * isoDate()("2026-02-29"); // { ok: false, ... }: 2026 is not a leap year
 * ```
 */
export const isoDate = /* @__PURE__ */ formatFactory("date", (text) =>
  DATE_PATTERN.test(text) && isCalendarDate(text) ? text : undefined,
);
