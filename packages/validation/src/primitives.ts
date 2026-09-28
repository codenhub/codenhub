import { BaseValidator, type ValidationContext } from "./core";
import { describeReceived, type ValidationResult } from "./result";

/**
 * Schema validator matching strictly `null`.
 */
export class NullValidator extends BaseValidator<null, unknown> {
  /**
   * Constructs a NullValidator.
   *
   * @param customMessage - Optional custom failure message.
   */
  constructor(private readonly customMessage?: string) {
    super();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<null> {
    if (input === null) {
      return ctx.ok(null);
    }
    return ctx.fail({
      code: "invalid_type",
      message: this.customMessage ?? `Expected null, got ${describeReceived(input)}`,
      expected: "null",
      received: describeReceived(input),
      input: ctx.options.includeInput ? input : undefined,
    });
  }
}

/**
 * Schema validator matching strictly `undefined`.
 */
export class UndefinedValidator extends BaseValidator<undefined, unknown> {
  /**
   * Constructs an UndefinedValidator.
   *
   * @param customMessage - Optional custom failure message.
   */
  constructor(private readonly customMessage?: string) {
    super();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<undefined> {
    if (input === undefined) {
      return ctx.ok(undefined);
    }
    return ctx.fail({
      code: "invalid_type",
      message: this.customMessage ?? `Expected undefined, got ${describeReceived(input)}`,
      expected: "undefined",
      received: describeReceived(input),
      input: ctx.options.includeInput ? input : undefined,
    });
  }
}

/**
 * Schema validator matching `void` (accepts `undefined`).
 */
export class VoidValidator extends BaseValidator<void, unknown> {
  /**
   * Constructs a VoidValidator.
   *
   * @param customMessage - Optional custom failure message.
   */
  constructor(private readonly customMessage?: string) {
    super();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<void> {
    if (input === undefined) {
      return ctx.ok(undefined);
    }
    return ctx.fail({
      code: "invalid_type",
      message: this.customMessage ?? `Expected void, got ${describeReceived(input)}`,
      expected: "void",
      received: describeReceived(input),
      input: ctx.options.includeInput ? input : undefined,
    });
  }
}

/**
 * Schema validator representing the `never` type, which unconditionally rejects any input.
 */
export class NeverValidator extends BaseValidator<never, unknown> {
  /**
   * Constructs a NeverValidator.
   *
   * @param customMessage - Optional custom failure message.
   */
  constructor(private readonly customMessage?: string) {
    super();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<never> {
    return ctx.fail({
      code: "custom",
      message: this.customMessage ?? `Expected never, got ${describeReceived(input)}`,
      expected: "never",
      received: describeReceived(input),
      input: ctx.options.includeInput ? input : undefined,
    });
  }
}

/**
 * Creates a schema validator matching strictly `null`.
 *
 * @param message - Optional custom failure message.
 * @returns A new NullValidator instance.
 */
export function nullValidator(message?: string): NullValidator {
  return new NullValidator(message);
}

/**
 * Creates a schema validator matching strictly `undefined`.
 *
 * @param message - Optional custom failure message.
 * @returns A new UndefinedValidator instance.
 */
export function undefinedValidator(message?: string): UndefinedValidator {
  return new UndefinedValidator(message);
}

/**
 * Creates a schema validator matching `void` (accepts `undefined`).
 *
 * @param message - Optional custom failure message.
 * @returns A new VoidValidator instance.
 */
export function voidValidator(message?: string): VoidValidator {
  return new VoidValidator(message);
}

/**
 * Creates a schema validator representing `never` that unconditionally fails.
 *
 * @param message - Optional custom failure message.
 * @returns A new NeverValidator instance.
 */
export function neverValidator(message?: string): NeverValidator {
  return new NeverValidator(message);
}

export { nullValidator as null, undefinedValidator as undefined, voidValidator as void, neverValidator as never };
