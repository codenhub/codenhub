import { coerceToBigint } from "./coercion";
import { Validator } from "./core";
import { invalidCoercion, invalidType, limit, pass, type Outcome, type ParseContext } from "./internal";
import { type Message } from "./issue";

/** Validator for bigints, created by {@link bigint}. */
export class BigintValidator extends Validator<bigint> {
  /**
   * Creates a bigint validator.
   *
   * @param message - Message when the input is not a bigint.
   * @param isCoerced - Converts integer numbers and integer strings to bigints instead of rejecting them.
   */
  constructor(
    private readonly message?: Message,
    private readonly isCoerced = false,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): Outcome<bigint> {
    if (this.isCoerced) {
      const converted = coerceToBigint(input);
      return converted === undefined ? invalidCoercion(ctx, "bigint", input, this.message) : pass(converted);
    }
    return typeof input === "bigint" ? pass(input) : invalidType(ctx, "bigint", input, this.message);
  }

  /**
   * Requires a value of at least `bound`.
   *
   * @param bound - Smallest accepted value.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  min(bound: bigint, message?: Message): this {
    return this.addStep(limit("min", bound, { isInclusive: true, type: "bigint", message }));
  }

  /**
   * Requires a value of at most `bound`.
   *
   * @param bound - Largest accepted value.
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  max(bound: bigint, message?: Message): this {
    return this.addStep(limit("max", bound, { isInclusive: true, type: "bigint", message }));
  }

  /**
   * Requires a value greater than zero.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  positive(message?: Message): this {
    return this.addStep(
      limit("min", 0n, { isInclusive: false, type: "bigint", message: message ?? "Must be positive" }),
    );
  }

  /**
   * Requires a value less than zero.
   *
   * @param message - Failure message.
   * @returns The validator with the rule added.
   */
  negative(message?: Message): this {
    return this.addStep(
      limit("max", 0n, { isInclusive: false, type: "bigint", message: message ?? "Must be negative" }),
    );
  }
}

/**
 * Creates a validator for bigints.
 *
 * @param message - Message when the input is not a bigint.
 * @returns A bigint validator.
 */
export function bigint(message?: Message): BigintValidator {
  return new BigintValidator(message);
}
