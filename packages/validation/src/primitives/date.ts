import { leaf, split } from "../core/checks";
import { timeOf } from "../core/objects";
import { assertOrder, describeType, issue } from "../core/result";
import type { Factory, MessageOptions } from "../core/types";

/** Bounds for {@link date}. Every option is optional. */
export interface DateOptions extends MessageOptions {
  /** Requires this moment or a later one. Must be a valid `Date`. */
  min?: Date;
  /** Requires this moment or an earlier one. Must be a valid `Date`. */
  max?: Date;
}

/** A `Date` from any realm that holds a moment. */
const isValidDate = (input: unknown): boolean => {
  const time = timeOf(input);
  return time !== undefined && !Number.isNaN(time);
};

/**
 * Reads a bound as the moment it holds, rejecting one that is not a `Date`, such as a string passed
 * where the types were not checked, as a `TypeError`, and an invalid one as a `RangeError`. It is read as
 * `timeOf` reads input, so a `Date` from another realm is one too.
 */
const readBound = (name: string, bound: Date | undefined): number | undefined => {
  if (bound === undefined) {
    return undefined;
  }
  const time = timeOf(bound);
  if (time === undefined) {
    throw new TypeError(`${name} must be a Date, received ${describeType(bound)}`);
  }
  if (Number.isNaN(time)) {
    throw new RangeError(`${name} must be a valid Date`);
  }
  return time;
};

/**
 * Creates a validator for valid `Date` objects. An invalid `Date` such as `new Date("nope")`, a
 * timestamp and a date string are all rejected; parse text with `isoDate` or convert it first.
 *
 * @example
 * ```ts
 * const birthday = date({ max: new Date() });
 * birthday(new Date("1990-04-01")); // { ok: true, ... }
 * birthday(new Date("nope")); // { ok: false, ... }, code "invalid_type"
 * ```
 *
 * @param options - Earliest and latest accepted moments, both inclusive.
 * @returns A validator that produces a `Date`.
 * @throws {TypeError} When `min` or `max` is not a `Date`.
 * @throws {RangeError} When `min` or `max` is an invalid `Date`, or `min` is after `max`.
 */
export const date = ((...args: unknown[]) => {
  const [options, checks] = split<DateOptions, Date>(args, "min max");
  // Bounds are read as times now and reported as new Dates, so neither changing the options later
  // nor changing a reported bound can move them.
  const min = readBound("Minimum date", options.min);
  const max = readBound("Maximum date", options.max);
  assertOrder("min", min, "max", max);
  return leaf<Date>("valid date", isValidDate, options.message, checks, (value, issues) => {
    const time = timeOf(value) as number;
    if (min !== undefined && time < min) {
      issues.push(issue("too_small", { minimum: new Date(min), inclusive: true, type: "date" }));
    }
    if (max !== undefined && time > max) {
      issues.push(issue("too_big", { maximum: new Date(max), inclusive: true, type: "date" }));
    }
    return value;
  });
}) as Factory<Date, DateOptions>;
