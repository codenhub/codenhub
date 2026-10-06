import { split } from "../core/checks";
import { assertOption, assertSize } from "../core/result";
import type { Factory, MessageOptions } from "../core/types";
import { isCalendarDate } from "./calendar";
import { stringFormat } from "./text-format";

/** Nanoseconds, the finest a timestamp is written in; more digits would build a pattern nobody meant. */
const MAX_PRECISION = 9;

/** Hours, minutes and seconds of a day, as ISO 8601 writes them. */
export const TIME = "(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d";

/**
 * The fractional seconds a precision allows: any number of digits, optionally, when it is omitted, none
 * for 0, and exactly that many otherwise.
 */
export function fractionPattern(precision: number | undefined): string {
  if (precision === undefined) {
    return "(?:\\.\\d+)?";
  }
  assertSize("precision", precision);
  if (precision > MAX_PRECISION) {
    throw new RangeError(`precision is at most ${MAX_PRECISION} digits, received ${precision}`);
  }
  return precision === 0 ? "" : `\\.\\d{${precision}}`;
}

/** Options for {@link datetime}. */
export interface DatetimeOptions extends MessageOptions {
  /**
   * Accepts a UTC offset such as `+02:00` instead of only `Z`.
   *
   * @defaultValue false
   */
  offset?: boolean | undefined;
  /**
   * Also accepts a date-time without a zone, which names a time on a local clock rather than a moment,
   * such as `2026-09-28T14:30` from an HTML `datetime-local` input. Without `precision`, such a time may
   * leave out its seconds, as that input does when they are zero; a time with a zone still needs them.
   *
   * @defaultValue false
   */
  local?: boolean | undefined;
  /** Exact number of fractional-second digits, an integer from 0 to 9. `0` forbids them; they are optional and unbounded when omitted. */
  precision?: number | undefined;
}

/**
 * Creates a validator for ISO 8601 date-times such as `2026-09-28T14:30:00Z`, on a day that
 * exists. The value is not modified. The `T` and `Z` are uppercase, so the lowercase `t` and `z` and the
 * space RFC 3339 also allows fail, and `+00:00` is an offset, which needs `offset: true`.
 *
 * @example
 * ```ts
 * datetime()("2026-09-28T14:30:00Z"); // { ok: true, ... }
 * datetime()("2026-02-30T00:00:00Z"); // { ok: false, ... }: February has no 30th
 * datetime({ offset: true })("2026-09-28T14:30:00+02:00"); // { ok: true, ... }
 * datetime({ local: true })("2026-09-28T14:30"); // { ok: true, ... }, a datetime-local value
 * ```
 *
 * @throws {TypeError} When `offset` or `local` is not a boolean, or `precision` is not a number.
 * @throws {RangeError} When `precision` is not an integer from 0 to 9.
 */
export const datetime = ((...args: unknown[]) => {
  const [{ offset, local, precision, message }, checks] = split<DatetimeOptions, string>(
    args,
    "offset local precision",
  );
  assertOption("offset", offset, "boolean");
  assertOption("local", local, "boolean");
  const fraction = fractionPattern(precision);
  const zone = offset === true ? "(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)" : "Z";
  const clock = `${TIME}${fraction}${zone}${local === true ? "?" : ""}`;
  // A time without a zone may leave out its seconds, as an HTML `datetime-local` input does, unless a
  // precision asks for a fraction of them. A time with a zone keeps the rules it has without `local`.
  const times = local === true && precision === undefined ? `(?:${clock}|(?:[01]\\d|2[0-3]):[0-5]\\d)` : clock;
  const pattern = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})T${times}$`);
  return stringFormat(
    "datetime",
    (text) => {
      const date = pattern.exec(text)?.[1];
      return date !== undefined && isCalendarDate(date) ? text : undefined;
    },
    message,
    checks,
  );
}) as Factory<string, DatetimeOptions>;
