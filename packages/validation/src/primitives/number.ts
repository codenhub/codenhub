import { assertBounds, assertOrder, failWith, invalidType, pass, toIssue } from "../core/result";
import type { ValidationIssue, Validator } from "../core/types";

/** Constraints and clean-up for {@link number}. Every option is optional. */
export interface NumberOptions {
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
  /**
   * Requires a multiple of this positive number, compared as the decimals both are written as, so `0.3`
   * is a multiple of `0.1` at any size. A value computed in floating point, such as `0.1 + 0.2`, is
   * compared as the number it actually is, `0.30000000000000004`.
   */
  multipleOf?: number;
  /**
   * Requires a value other than zero.
   *
   * @defaultValue false
   */
  nonZero?: boolean;
  /** Moves the value into this range instead of rejecting it, before the constraints run and in the output. */
  clamp?: { min: number; max: number };
}

const outOfRange = (side: "min" | "max", bound: number, isInclusive: boolean): ValidationIssue =>
  toIssue({
    code: side === "min" ? "too_small" : "too_big",
    params: { [side === "min" ? "minimum" : "maximum"]: bound, inclusive: isInclusive, type: "number" },
  });

const invalidValue = (format: string): ValidationIssue =>
  toIssue({ code: "invalid_value", params: { type: "number", format } });

/** A number's shortest text as whole digits and a power of ten: 0.35 is 35 and -2, 1e-7 is 1 and -7. */
const toDecimal = (value: number): { digits: bigint; exponent: number } => {
  const [mantissa = "0", exponent = "0"] = value.toExponential().split("e");
  const [whole = "0", fraction = ""] = mantissa.split(".");
  return { digits: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
};

const isMultipleOf = (value: number, step: number): boolean => {
  // `%` is exact, so whole numbers of any size are compared as they are.
  if (Number.isInteger(value) && Number.isInteger(step)) {
    return value % step === 0;
  }
  // Otherwise both are read as the decimals they are written as, scaled to whole numbers with the same
  // power of ten, so 0.3 is a multiple of 0.1 and 1e16 is not one of 0.3, at any size.
  const left = toDecimal(value);
  const right = toDecimal(step);
  const exponent = Math.min(left.exponent, right.exponent);
  const scale = (decimal: { digits: bigint; exponent: number }): bigint =>
    decimal.digits * 10n ** BigInt(decimal.exponent - exponent);
  return scale(left) % scale(right) === 0n;
};

/**
 * Creates a validator for finite numbers. `NaN` and the infinities are always rejected.
 *
 * @remarks
 * `clamp` runs first, then every constraint is checked against the clamped number, and each failing
 * constraint reports its own issue.
 *
 * @example
 * ```ts
 * const age = number({ int: true, min: 0, max: 130 });
 * age(42); // { ok: true, value: 42 }
 * age(-1); // { ok: false, error: { issues: [{ code: "too_small", ... }] } }
 * ```
 *
 * @param options - Constraints and clean-up to apply.
 * @returns A validator that produces a number.
 * @throws {RangeError} When a bound is `NaN`, a lower bound is `Infinity` or an upper one `-Infinity`,
 * no number can satisfy the bounds together, `multipleOf` is not a positive finite number, or `clamp`
 * has a `NaN` bound, a minimum above its maximum, or a range whose every value breaks a bound. Bounds
 * that hold numbers but no whole one, such as `{ int: true, gt: 1, lt: 2 }`, are not caught here, and
 * reject every input.
 */
export function number(options: NumberOptions = {}): Validator<number> {
  const { min, max, gt, lt, int, safeInt, multipleOf, nonZero } = options;
  // Copied, so changing the range after the validator is made changes nothing.
  const clamp = options.clamp && { min: options.clamp.min, max: options.clamp.max };
  if (multipleOf !== undefined && (!Number.isFinite(multipleOf) || multipleOf <= 0)) {
    throw new RangeError(`multipleOf must be a positive finite number, received ${multipleOf}`);
  }
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

  return (input) => {
    if (typeof input !== "number" || !Number.isFinite(input)) {
      return invalidType("number", input);
    }

    const value = clamp === undefined ? input : Math.min(Math.max(input, clamp.min), clamp.max);

    const issues: ValidationIssue[] = [];
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
    }
    if (safeInt === true && !Number.isSafeInteger(value)) {
      issues.push(invalidValue("safeInt"));
    }
    if (nonZero === true && value === 0) {
      issues.push(invalidValue("nonZero"));
    }
    if (multipleOf !== undefined && !isMultipleOf(value, multipleOf)) {
      issues.push(toIssue({ code: "invalid_value", params: { multipleOf } }));
    }
    return issues.length > 0 ? failWith(issues) : pass(value);
  };
}
