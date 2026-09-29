import { assertSize } from "../core/result";
import type { Validator } from "../core/types";
import { isCalendarDate } from "./calendar";
import { textFormat } from "./text-format";

/** Nanoseconds, the finest a timestamp is written in; more digits would build a pattern nobody meant. */
const MAX_PRECISION = 9;

/** Options for {@link datetime}. */
export interface DatetimeOptions {
  /**
   * Accepts a UTC offset such as `+02:00` instead of only `Z`.
   *
   * @defaultValue false
   */
  offset?: boolean;
  /** Exact number of fractional-second digits, an integer from 0 to 9. `0` forbids them; they are optional and unbounded when omitted. */
  precision?: number;
}

/**
 * Creates a validator for ISO 8601 date-times such as `2026-09-28T14:30:00Z`, on a day that
 * exists. The value is not modified.
 *
 * @example
 * ```ts
 * datetime()("2026-09-28T14:30:00Z"); // { ok: true, ... }
 * datetime()("2026-02-30T00:00:00Z"); // { ok: false, ... }: February has no 30th
 * datetime({ offset: true })("2026-09-28T14:30:00+02:00"); // { ok: true, ... }
 * ```
 *
 * @param options - Whether offsets are allowed, and the fractional-second precision.
 * @returns A validator that produces the text as a string.
 * @throws {RangeError} When `precision` is not an integer from 0 to 9.
 */
export function datetime({ offset, precision }: DatetimeOptions = {}): Validator<string> {
  if (precision !== undefined) {
    assertSize("Datetime precision", precision);
    if (precision > MAX_PRECISION) {
      throw new RangeError(`Datetime precision is at most ${MAX_PRECISION} digits, received ${precision}`);
    }
  }
  const fraction = precision === undefined ? "(?:\\.\\d+)?" : precision === 0 ? "" : `\\.\\d{${precision}}`;
  const zone = offset === true ? "(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)" : "Z";
  const pattern = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d${fraction}${zone}$`);
  return textFormat("datetime", (text) => {
    const date = pattern.exec(text)?.[1];
    return date !== undefined && isCalendarDate(date);
  });
}
