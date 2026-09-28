import { coerceToDate } from "./coercion";
import { Validator } from "./core";
import { constraint, invalidCoercion, invalidType, pass, type Outcome, type ParseContext } from "./internal";
import { type Message } from "./issue";

/** Validator for valid `Date` instances, created by {@link date}. */
export class DateValidator extends Validator<Date> {
  /**
   * Creates a date validator.
   *
   * @param message - Message when the input is not a valid `Date`.
   * @param isCoerced - Converts timestamps and ISO 8601 strings to dates instead of rejecting them.
   */
  constructor(
    private readonly message?: Message,
    private readonly isCoerced = false,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): Outcome<Date> {
    if (this.isCoerced) {
      const converted = coerceToDate(input);
      return converted === undefined ? invalidCoercion(ctx, "date", input, this.message) : pass(converted);
    }
    return input instanceof Date && !Number.isNaN(input.getTime())
      ? pass(input)
      : invalidType(ctx, "date", input, this.message);
  }

  /**
   * Requires a date on or after `bound`.
   *
   * @param bound - Earliest accepted date.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  min(bound: Date, message?: Message): this {
    return this.addStep(
      constraint((value) => value.getTime() >= bound.getTime(), {
        code: "too_small",
        message: message ?? `Must be on or after ${bound.toISOString()}`,
        params: { minimum: bound, inclusive: true, type: "date" },
      }),
    );
  }

  /**
   * Requires a date on or before `bound`.
   *
   * @param bound - Latest accepted date.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  max(bound: Date, message?: Message): this {
    return this.addStep(
      constraint((value) => value.getTime() <= bound.getTime(), {
        code: "too_big",
        message: message ?? `Must be on or before ${bound.toISOString()}`,
        params: { maximum: bound, inclusive: true, type: "date" },
      }),
    );
  }
}

/**
 * Creates a validator for valid `Date` instances. `Invalid Date` is rejected.
 *
 * @param message - Message when the input is not a valid `Date`.
 * @returns A date validator.
 */
export function date(message?: Message): DateValidator {
  return new DateValidator(message);
}
