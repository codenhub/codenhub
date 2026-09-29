import { invalidCoercion } from "../core/result";
import type { Validator } from "../core/types";
import { isCalendarDate } from "../formats/calendar";
import { date, type DateOptions } from "../primitives/date";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/**
 * Creates a validator for dates that also accepts finite timestamps in milliseconds and ISO 8601
 * strings such as `2026-09-28` or `2026-09-28T14:30:00Z`, converting them to a `Date`, then applies
 * the same bounds as {@link date}.
 *
 * @remarks
 * Free-form text such as `"yesterday"` or `"09/28/2026"` is rejected, because how it is read depends
 * on the runtime, and so is a date that does not exist such as `2026-02-30`. Date-only strings and
 * strings without an offset are read the way `new Date` reads them, that is as UTC for a date and as
 * local time for a date-time without an offset. A value that cannot be converted fails with
 * `invalid_type` and `coerced: true` in `params`.
 *
 * @example
 * ```ts
 * coerceDate()("2026-09-28"); // { ok: true, value: Date 2026-09-28T00:00:00.000Z }
 * coerceDate()(0); // { ok: true, value: Date 1970-01-01T00:00:00.000Z }
 * coerceDate()("yesterday"); // { ok: false, ... }, code "invalid_type"
 * ```
 *
 * @param options - Earliest and latest accepted moments, exactly as for `date`.
 * @returns A validator that produces a `Date`.
 * @throws {RangeError} When `min` or `max` is an invalid `Date`.
 */
export function coerceDate(options: DateOptions = {}): Validator<Date> {
  const strict = date(options);
  return (input) => {
    if (input instanceof Date) {
      return strict(input);
    }
    if (typeof input === "number" && Number.isFinite(input)) {
      return strict(new Date(input));
    }
    if (typeof input === "string") {
      const text = input.trim();
      if (ISO_DATE_PATTERN.test(text) && isCalendarDate(text.slice(0, 10))) {
        return strict(new Date(text));
      }
    }
    return invalidCoercion("valid date", input);
  };
}
