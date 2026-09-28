import { BaseValidator, type ValidationContext } from "./core";
import { type ValidationResult } from "./result";

/**
 * Validator that accepts any input without type checking or constraints.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class AnyValidator extends BaseValidator<any, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<any> {
    return ctx.ok(input);
  }
}

/**
 * Validator that accepts any unknown input without type narrowing.
 */
export class UnknownValidator extends BaseValidator<unknown, unknown> {
  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<unknown> {
    return ctx.ok(input);
  }
}

/**
 * Creates an {@link AnyValidator} schema instance that allows any input.
 *
 * @returns A new AnyValidator instance.
 */
export function any(): AnyValidator {
  return new AnyValidator();
}

/**
 * Creates an {@link UnknownValidator} schema instance that allows any input typed as unknown.
 *
 * @returns A new UnknownValidator instance.
 */
export function unknownValidator(): UnknownValidator {
  return new UnknownValidator();
}
