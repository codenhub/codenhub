import { split } from "../core/checks";
import type { Factory, MessageOptions } from "../core/types";
import { fractionPattern, TIME } from "./datetime";
import { stringFormat } from "./text-format";

/** Options for {@link time}. */
export interface TimeOptions extends MessageOptions {
  /**
   * Exact number of fractional-second digits, an integer from 0 to 9, which also makes the seconds
   * required. Without it, the seconds and their fraction are optional and the fraction unbounded.
   */
  precision?: number;
}

/**
 * Creates a validator for ISO 8601 times of day without an offset, such as `14:30`, `14:30:00` or
 * `14:30:00.250`, as an HTML time input writes them. The value is not modified.
 *
 * @example
 * ```ts
 * time()("09:15"); // { ok: true, value: "09:15" }
 * time()("24:00"); // { ok: false, ... }, code "invalid_format"
 * time({ precision: 0 })("09:15"); // { ok: false, ... }: the seconds are required
 * ```
 *
 * @throws {TypeError} When `precision` is not a number.
 * @throws {RangeError} When `precision` is not an integer from 0 to 9.
 */
export const time = ((...args: unknown[]) => {
  const [{ precision, message }, checks] = split<TimeOptions, string>(args);
  const pattern = new RegExp(
    precision === undefined
      ? `^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d${fractionPattern(undefined)})?$`
      : `^${TIME}${fractionPattern(precision)}$`,
  );
  return stringFormat("time", (text) => (pattern.test(text) ? text : undefined), message, checks);
}) as Factory<string, TimeOptions>;
