import { BaseValidator, type ValidationContext } from "./core";
import { describeReceived, type ValidationResult } from "./result";

/**
 * Generic class constructor type accepted by {@link InstanceofValidator}.
 *
 * @typeParam T - Constructed instance type.
 */
export type Constructor<T = unknown> = abstract new (...args: never[]) => T;

/**
 * Schema validator checking that an input value is an instance of a given constructor class.
 *
 * @typeParam T - Expected instance type.
 */
export class InstanceofValidator<T> extends BaseValidator<T, unknown> {
  /**
   * Constructs an InstanceofValidator.
   *
   * @param expectedClass - Target constructor class.
   * @param customMessage - Optional custom failure message.
   */
  constructor(
    private readonly expectedClass: Constructor<T>,
    private readonly customMessage?: string,
  ) {
    super();
  }

  /**
   * Returns the expected constructor class.
   */
  get expected(): Constructor<T> {
    return this.expectedClass;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<T> {
    if (
      (typeof input === "object" && input !== null && input instanceof this.expectedClass) ||
      (typeof input === "function" && input instanceof this.expectedClass)
    ) {
      return ctx.ok(input as T);
    }

    const className = this.expectedClass.name || "instance";
    return ctx.fail({
      code: "invalid_type",
      message: this.customMessage ?? `Expected instance of ${className}, got ${describeReceived(input)}`,
      expected: `instance of ${className}`,
      received: describeReceived(input),
      input: ctx.options.includeInput ? input : undefined,
    });
  }
}

/**
 * Creates a schema validator checking that an input value is an instance of a given constructor class.
 *
 * @typeParam T - Expected instance type.
 * @param constructor - Target constructor class.
 * @param message - Optional custom failure message.
 * @returns A new InstanceofValidator instance.
 */
export function instanceOf<T>(constructor: Constructor<T>, message?: string): InstanceofValidator<T> {
  return new InstanceofValidator(constructor, message);
}

export { instanceOf as instanceof };
