import { timeOf } from "../core/objects";
import type { Factory } from "../core/types";
import { isCalendarDate } from "../formats/calendar";
import { date, type DateOptions } from "../primitives/date";
import { coercing } from "./coerce";

// The seconds may be left out, as an HTML `datetime-local` input leaves them out when they are zero, and
// a fraction needs them.
const ISO_PATTERN =
  /^(\d{4}-\d{2}-\d{2})(?:[T ]((?:[01]\d|2[0-3]):[0-5]\d)(?::([0-5]\d)(?:\.(\d+))?)?(Z|[+-](?:[01]\d|2[0-3])(?::?[0-5]\d)?)?)?$/;

/** Reads an ISO 8601 string as an exact moment, or returns undefined when it names none. */
const readIso = (text: string): Date | undefined => {
  const match = ISO_PATTERN.exec(text);
  if (match === null || !isCalendarDate(match[1] as string)) {
    return undefined;
  }
  const [, day, time, seconds = "00", fraction = "", zone] = match;
  if (time === undefined) {
    return new Date(day as string);
  }
  const offset =
    zone === undefined ? "Z" : zone.length === 3 ? `${zone}:00` : zone.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  // A Date holds milliseconds, so the fraction is cut to three digits by hand: how a runtime reads more
  // is its own choice, and this reads every runtime the same.
  return new Date(`${day}T${time}:${seconds}.${fraction.slice(0, 3).padEnd(3, "0")}${offset}`);
};

/**
 * Creates a validator for dates that also accepts whole timestamps in milliseconds and ISO 8601
 * strings such as `2026-09-28`, `2026-09-28T14:30` from an HTML `datetime-local` input, or
 * `2026-09-28T14:30:00Z`, converting them to a `Date`, then applies
 * the same bounds as {@link date}.
 *
 * @remarks
 * Text is read as `YYYY-MM-DD`, alone or followed by `T` or a space, `HH:MM` or `HH:MM:SS` with an
 * optional fraction, and an optional zone: `Z`, or an offset written `+HH`, `+HHMM` or `+HH:MM`. That is wider than
 * `datetime`, which checks one exact spelling. Free-form text such as `"yesterday"` or `"09/28/2026"` is rejected, because how it is read depends
 * on the runtime, and so is a date or time that does not exist, such as `2026-02-30` or `25:00:00`.
 * Fractions of a second beyond milliseconds are cut, not rounded. A date without a time and a date-time without an offset are both read as UTC, so the result never
 * depends on the timezone of the machine. A value that cannot be converted fails with
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
 * @throws {TypeError} When `min` or `max` is not a `Date`.
 * @throws {RangeError} When `min` or `max` is an invalid `Date`, or `min` is after `max`.
 */
export const coerceDate = ((...args: unknown[]) =>
  coercing("valid date", date(...(args as [])), args, (input) => {
    if (timeOf(input) !== undefined) {
      return [input];
    }
    if (typeof input === "number" && Number.isInteger(input)) {
      const converted = new Date(input);
      // A timestamp past what a Date can hold, about 275,000 years either way, converts to nothing.
      return Number.isNaN(converted.getTime()) ? undefined : [converted];
    }
    const parsed = typeof input === "string" ? readIso(input.trim()) : undefined;
    return parsed === undefined ? undefined : [parsed];
  })) as Factory<Date, DateOptions>;
