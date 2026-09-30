import { leaf, split } from "../core/checks";
import { assertBounds, assertOrder, issue } from "../core/result";
import type { Factory, MessageOptions, ValidationIssue } from "../core/types";

/**
 * Constraints and clean-up for {@link number}. Every option is optional. Rarer constraints, such as
 * `multipleOf` or `nonZero`, are checks given after the options.
 */
export interface NumberOptions extends MessageOptions {
  /** Requires a value of at least this. */
  min?: number;
  /** Requires a value of at most this. */
  max?: number;
  /** Requires a value strictly greater than this. */
  gt?: number;
  /** Requires a value strictly less than this. */
  lt?: number;
  /**
   * Requires a whole number.
   *
   * @defaultValue false
   */
  int?: boolean;
  /**
   * Requires a whole number that a double represents exactly, that is within `Number.MAX_SAFE_INTEGER`.
   *
   * @defaultValue false
   */
  safeInt?: boolean;
  /** Moves the value into this range instead of rejecting it, before the constraints run and in the output. */
  clamp?: { min: number; max: number };
}

const outOfRange = (side: "min" | "max", bound: number, isInclusive: boolean): ValidationIssue =>
  issue(side === "min" ? "too_small" : "too_big", {
    [side === "min" ? "minimum" : "maximum"]: bound,
    inclusive: isInclusive,
    type: "number",
  });

const invalidValue = (format: string): ValidationIssue => issue("invalid_value", { type: "number", format });

const isNumber = (input: unknown): boolean => typeof input === "number" && Number.isFinite(input);

/**
 * Creates a validator for finite numbers. `NaN` and the infinities are always rejected.
 *
 * @remarks
 * `clamp` runs first, then every constraint and every check runs on the clamped number, and each
 * failing one reports its own issue.
 *
 * @example
 * ```ts
 * const age = number({ int: true, min: 0, max: 130 });
 * age(42); // { ok: true, value: 42 }
 * age(-1); // { ok: false, error: { issues: [{ code: "too_small", ... }] } }
 * number({ min: 0 }, multipleOf(0.01)); // money
 * ```
 *
 * @throws {RangeError} When a bound is `NaN`, a lower bound is `Infinity` or an upper one `-Infinity`,
 * no number can satisfy the bounds together, or `clamp`
 * has a `NaN` bound, a minimum above its maximum, or a range whose every value breaks a bound. Bounds
 * that hold numbers but no whole one, such as `{ int: true, gt: 1, lt: 2 }`, are not caught here, and
 * reject every input.
 */
export const number = ((...args: unknown[]) => {
  const [options, checks] = split<NumberOptions, number>(args);
  const { min, max, gt, lt, int, safeInt, message } = options;
  // Copied, so changing the range after the validator is made changes nothing.
  const clamp = options.clamp && { min: options.clamp.min, max: options.clamp.max };
  for (const [name, bound] of Object.entries({ min, max, gt, lt })) {
    if (Number.isNaN(bound)) {
      throw new RangeError(`${name} must be a number, received NaN`);
    }
    // Only finite numbers pass, so a lower bound of Infinity or an upper one of -Infinity shuts out all.
    if (bound === (name === "min" || name === "gt" ? Infinity : -Infinity)) {
      throw new RangeError(`No finite number can satisfy ${name} ${bound}`);
    }
  }
  assertBounds(options);
  if (clamp !== undefined) {
    if (Number.isNaN(clamp.min) || Number.isNaN(clamp.max)) {
      throw new RangeError("clamp bounds must be numbers, received NaN");
    }
    if (clamp.min > clamp.max) {
      throw new RangeError(`clamp minimum ${clamp.min} is greater than maximum ${clamp.max}`);
    }
    // Every value leaves the clamp inside its range, so a bound that range lies wholly outside of rejects all.
    assertOrder("min", min, "clamp.max", clamp.max);
    assertOrder("gt", gt, "clamp.max", clamp.max, true);
    assertOrder("clamp.min", clamp.min, "max", max);
    assertOrder("clamp.min", clamp.min, "lt", lt, true);
  }

  return leaf<number>("number", isNumber, message, checks, (input, issues) => {
    const value = clamp === undefined ? input : Math.min(Math.max(input, clamp.min), clamp.max);
    if (min !== undefined && value < min) {
      issues.push(outOfRange("min", min, true));
    }
    if (gt !== undefined && value <= gt) {
      issues.push(outOfRange("min", gt, false));
    }
    if (max !== undefined && value > max) {
      issues.push(outOfRange("max", max, true));
    }
    if (lt !== undefined && value >= lt) {
      issues.push(outOfRange("max", lt, false));
    }
    if (int === true && !Number.isInteger(value)) {
      issues.push(invalidValue("int"));
    } else if (safeInt === true && !Number.isSafeInteger(value)) {
      // A fraction that int already reported is not reported again as an unsafe integer.
      issues.push(invalidValue("safeInt"));
    }
    return value;
  });
}) as Factory<number, NumberOptions>;
