import { BaseValidator, type ValidationContext } from "./core";
import { describeReceived, type ValidationResult } from "./result";

/** Supported primitive types for literal equality validation. */
export type LiteralValue = string | number | boolean | bigint | symbol | null | undefined;

/**
 * Validates that an input strictly matches an expected literal value.
 *
 * @template T - The literal value type.
 */
export class LiteralValidator<T extends LiteralValue> extends BaseValidator<T, unknown> {
  constructor(
    private readonly expectedValue: T,
    private readonly customMessage?: string,
  ) {
    super();
  }

  /**
   * Returns the expected literal value.
   */
  get value(): T {
    return this.expectedValue;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<T> {
    if (Object.is(input, this.expectedValue)) {
      return ctx.ok(input as T);
    }

    const expectedStr =
      typeof this.expectedValue === "symbol"
        ? this.expectedValue.toString()
        : typeof this.expectedValue === "bigint"
          ? `${this.expectedValue}n`
          : (JSON.stringify(this.expectedValue) ?? String(this.expectedValue));

    return ctx.fail({
      code: "invalid_value",
      message: this.customMessage ?? `Expected literal ${expectedStr}, got ${describeReceived(input)}`,
      expected: expectedStr,
      received: describeReceived(input),
      input,
    });
  }
}

/**
 * Creates a {@link LiteralValidator} matching the given constant primitive value.
 *
 * @param expected - Expected constant value.
 * @param message - Optional custom failure message.
 * @returns A literal validator.
 */
export function literal<T extends LiteralValue>(expected: T, message?: string): LiteralValidator<T> {
  return new LiteralValidator(expected, message);
}

/**
 * Validates that an input is one of a predefined list of allowed values.
 *
 * @template T - Union of allowed enum elements.
 */
export class EnumValidator<T extends string | number> extends BaseValidator<T, unknown> {
  private readonly valueSet: Set<unknown>;

  constructor(
    private readonly values: readonly T[],
    private readonly customMessage?: string,
  ) {
    super();
    this.valueSet = new Set(values);
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<T> {
    if (this.valueSet.has(input)) {
      return ctx.ok(input as T);
    }

    const allowed = this.values.join(", ");
    return ctx.fail({
      code: "invalid_value",
      message: this.customMessage ?? `Expected one of [${allowed}], got ${describeReceived(input)}`,
      expected: allowed,
      received: describeReceived(input),
      input,
    });
  }
}

/**
 * Creates an {@link EnumValidator} matching one of the given elements.
 *
 * @param values - Array or tuple of allowed values.
 * @param message - Optional custom failure message.
 * @returns An enum validator.
 */
export function enumValidator<
  const T extends readonly [string | number, ...(string | number)[]] | readonly (string | number)[],
>(values: T, message?: string): EnumValidator<T[number]> {
  return new EnumValidator(values as unknown as readonly T[number][], message);
}
