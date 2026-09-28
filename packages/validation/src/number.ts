import { coerceToNumber } from "./coercion";
import { Validator } from "./core";
import { constraint, invalidCoercion, invalidType, limit, pass, type Outcome, type ParseContext } from "./internal";
import { type Message } from "./issue";

/**
 * Validator for finite numbers, created by {@link number}.
 *
 * `NaN` and the infinities are always rejected.
 */
export class NumberValidator extends Validator<number> {
  /**
   * Creates a number validator.
   *
   * @param message - Message when the input is not a finite number.
   * @param isCoerced - Converts numeric strings to numbers instead of rejecting them.
   */
  constructor(
    private readonly message?: Message,
    private readonly isCoerced = false,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): Outcome<number> {
    if (this.isCoerced) {
      const converted = coerceToNumber(input);
      return converted === undefined ? invalidCoercion(ctx, "number", input, this.message) : pass(converted);
    }
    return typeof input === "number" && Number.isFinite(input)
      ? pass(input)
      : invalidType(ctx, "number", input, this.message);
  }

  /**
   * Requires a value of at least `bound`.
   *
   * @param bound - Smallest accepted value.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  min(bound: number, message?: Message): this {
    return this.addStep(limit("min", bound, { isInclusive: true, type: "number", message }));
  }

  /**
   * Requires a value of at most `bound`.
   *
   * @param bound - Largest accepted value.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  max(bound: number, message?: Message): this {
    return this.addStep(limit("max", bound, { isInclusive: true, type: "number", message }));
  }

  /**
   * Requires a value strictly greater than `bound`.
   *
   * @param bound - Value the input must exceed.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  gt(bound: number, message?: Message): this {
    return this.addStep(limit("min", bound, { isInclusive: false, type: "number", message }));
  }

  /**
   * Requires a value strictly less than `bound`.
   *
   * @param bound - Value the input must stay below.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  lt(bound: number, message?: Message): this {
    return this.addStep(limit("max", bound, { isInclusive: false, type: "number", message }));
  }

  /**
   * Requires a value greater than zero.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  positive(message?: Message): this {
    return this.gt(0, message ?? "Must be positive");
  }

  /**
   * Requires a value less than zero.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  negative(message?: Message): this {
    return this.lt(0, message ?? "Must be negative");
  }

  /**
   * Requires a value of zero or more.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  nonNegative(message?: Message): this {
    return this.min(0, message ?? "Must not be negative");
  }

  /**
   * Requires a value of zero or less.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  nonPositive(message?: Message): this {
    return this.max(0, message ?? "Must not be positive");
  }

  /**
   * Requires a value other than zero.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  nonZero(message?: Message): this {
    return this.addStep(
      constraint((value) => value !== 0, {
        code: "invalid_value",
        message: message ?? "Must not be zero",
        params: { type: "number", format: "nonZero" },
      }),
    );
  }

  /**
   * Requires a whole number.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  int(message?: Message): this {
    return this.addStep(
      constraint((value) => Number.isInteger(value), {
        code: "invalid_value",
        message: message ?? "Must be an integer",
        params: { type: "number", format: "int" },
      }),
    );
  }

  /**
   * Requires a whole number that a double represents exactly, that is within `Number.MAX_SAFE_INTEGER`.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  safeInt(message?: Message): this {
    return this.addStep(
      constraint((value) => Number.isSafeInteger(value), {
        code: "invalid_value",
        message: message ?? "Must be a safe integer",
        params: { type: "number", format: "safeInt" },
      }),
    );
  }

  /**
   * Requires a multiple of `step`, tolerating floating-point error so `0.3` is a multiple of `0.1`.
   *
   * @param step - Positive number the value must be a multiple of.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   * @throws {RangeError} When `step` is not a positive finite number.
   */
  multipleOf(step: number, message?: Message): this {
    if (!Number.isFinite(step) || step <= 0) {
      throw new RangeError(`Step must be a positive finite number, received ${step}`);
    }
    return this.addStep(
      constraint(
        (value) => {
          const quotient = value / step;
          return Math.abs(quotient - Math.round(quotient)) <= Number.EPSILON * Math.max(1, Math.abs(quotient));
        },
        { code: "invalid_value", message: message ?? `Must be a multiple of ${step}`, params: { multipleOf: step } },
      ),
    );
  }

  /**
   * Moves the value into `[min, max]` instead of rejecting it, for the rules that follow and the output.
   *
   * @param min - Lower end of the range.
   * @param max - Upper end of the range.
   * @returns The validator with the step added.
   * @throws {RangeError} When `min` is greater than `max`.
   */
  clamp(min: number, max: number): this {
    if (min > max) {
      throw new RangeError(`Clamp minimum ${min} is greater than maximum ${max}`);
    }
    return this.addStep((value) => Math.min(Math.max(value, min), max));
  }
}

/**
 * Creates a validator for finite numbers. `NaN` and the infinities are rejected.
 *
 * @example
 * ```ts
 * const age = val.number().int().min(0);
 * ```
 *
 * @param message - Message when the input is not a finite number.
 * @returns A number validator.
 */
export function number(message?: Message): NumberValidator {
  return new NumberValidator(message);
}
