import { coerceToBoolean } from "./coercion";
import { Validator } from "./core";
import { constraint, invalidCoercion, invalidType, pass, type Outcome, type ParseContext } from "./internal";
import { type Message } from "./issue";

/** Validator for booleans, created by {@link boolean}. */
export class BooleanValidator extends Validator<boolean> {
  /**
   * Creates a boolean validator.
   *
   * @param message - Message when the input is not a boolean.
   * @param isCoerced - Converts `true`/`false`, `yes`/`no`, `on`/`off` and `1`/`0` to booleans instead of rejecting them.
   */
  constructor(
    private readonly message?: Message,
    private readonly isCoerced = false,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): Outcome<boolean> {
    if (this.isCoerced) {
      const converted = coerceToBoolean(input);
      return converted === undefined ? invalidCoercion(ctx, "boolean", input, this.message) : pass(converted);
    }
    return typeof input === "boolean" ? pass(input) : invalidType(ctx, "boolean", input, this.message);
  }

  /**
   * Requires the value to be `true`.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  true(message?: Message): this {
    return this.addStep(
      constraint((value) => value, {
        code: "invalid_value",
        message: message ?? "Must be true",
        params: { expected: true },
      }),
    );
  }

  /**
   * Requires the value to be `false`.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  false(message?: Message): this {
    return this.addStep(
      constraint((value) => !value, {
        code: "invalid_value",
        message: message ?? "Must be false",
        params: { expected: false },
      }),
    );
  }
}

/**
 * Creates a validator for booleans.
 *
 * @param message - Message when the input is not a boolean.
 * @returns A boolean validator.
 */
export function boolean(message?: Message): BooleanValidator {
  return new BooleanValidator(message);
}
