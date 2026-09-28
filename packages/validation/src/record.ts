import { BaseValidator, type ValidationContext, type Validator } from "./core";
import { isPlainObject } from "./object";
import { describeReceived, type ValidationIssue, type ValidationResult } from "./result";

/**
 * Schema validator for arbitrary dictionary/record objects with dynamic keys and values.
 *
 * Validates that input is a plain object, then validates every entry's value (and optionally
 * key) against the configured schemas.
 *
 * @typeParam TVal - Type of the record values.
 * @typeParam TKey - Type of the record keys (must extend string).
 */
export class RecordValidator<TVal, TKey extends string = string> extends BaseValidator<Record<TKey, TVal>, unknown> {
  /**
   * Constructs a RecordValidator.
   *
   * @param valueValidator - Schema validator applied to every value.
   * @param keyValidator - Optional schema validator applied to every key.
   */
  constructor(
    private readonly valueValidator: Validator<TVal>,
    private readonly keyValidator?: Validator<TKey>,
  ) {
    super();
  }

  /**
   * Returns the value validator schema.
   */
  get value(): Validator<TVal> {
    return this.valueValidator;
  }

  /**
   * Returns the key validator schema if defined.
   */
  get key(): Validator<TKey> | undefined {
    return this.keyValidator;
  }

  protected override isAsync(): boolean {
    const valAsync =
      this.valueValidator instanceof BaseValidator &&
      (this.valueValidator as unknown as { isAsync(): boolean }).isAsync();
    const keyAsync =
      this.keyValidator instanceof BaseValidator && (this.keyValidator as unknown as { isAsync(): boolean }).isAsync();
    return valAsync || keyAsync;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<Record<TKey, TVal>> {
    if (!isPlainObject(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected object, got ${describeReceived(input)}`,
        expected: "plain object",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    const localIssues: ValidationIssue[] = [];
    const output = {} as Record<TKey, TVal>;

    for (const [rawKey, rawVal] of Object.entries(input)) {
      let finalKey = rawKey as TKey;

      if (this.keyValidator !== undefined) {
        const keyRes = this.keyValidator.validate(rawKey as unknown as TKey, {
          ...ctx.options,
          path: [...ctx.path, rawKey],
        });

        if (!keyRes.ok) {
          if (keyRes.error.issues && keyRes.error.issues.length > 0) {
            for (const iss of keyRes.error.issues) {
              localIssues.push(iss);
              ctx.addIssue(iss);
            }
          } else {
            localIssues.push(keyRes.error);
            ctx.addIssue(keyRes.error);
          }

          if (ctx.options.abortEarly) {
            return ctx.fail(localIssues[0]);
          }
        } else {
          finalKey = keyRes.value;
        }
      }

      const valRes = this.valueValidator.validate(rawVal as unknown as TVal, {
        ...ctx.options,
        path: [...ctx.path, rawKey],
      });

      if (!valRes.ok) {
        if (valRes.error.issues && valRes.error.issues.length > 0) {
          for (const iss of valRes.error.issues) {
            localIssues.push(iss);
            ctx.addIssue(iss);
          }
        } else {
          localIssues.push(valRes.error);
          ctx.addIssue(valRes.error);
        }

        if (ctx.options.abortEarly) {
          return ctx.fail(localIssues[0]);
        }
      } else {
        Object.defineProperty(output, finalKey, {
          value: valRes.value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Record validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(output);
  }

  protected override async _validateAsync(
    input: unknown,
    ctx: ValidationContext,
  ): Promise<ValidationResult<Record<TKey, TVal>>> {
    if (!isPlainObject(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected object, got ${describeReceived(input)}`,
        expected: "plain object",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    const localIssues: ValidationIssue[] = [];
    const output = {} as Record<TKey, TVal>;

    /* oxlint-disable no-await-in-loop */
    for (const [rawKey, rawVal] of Object.entries(input)) {
      let finalKey = rawKey as TKey;

      if (this.keyValidator !== undefined) {
        const keyRes = await this.keyValidator.validateAsync(rawKey as unknown as TKey, {
          ...ctx.options,
          path: [...ctx.path, rawKey],
        });

        if (!keyRes.ok) {
          if (keyRes.error.issues && keyRes.error.issues.length > 0) {
            for (const iss of keyRes.error.issues) {
              localIssues.push(iss);
              ctx.addIssue(iss);
            }
          } else {
            localIssues.push(keyRes.error);
            ctx.addIssue(keyRes.error);
          }

          if (ctx.options.abortEarly) {
            return ctx.fail(localIssues[0]);
          }
        } else {
          finalKey = keyRes.value;
        }
      }

      const valRes = await this.valueValidator.validateAsync(rawVal as unknown as TVal, {
        ...ctx.options,
        path: [...ctx.path, rawKey],
      });

      if (!valRes.ok) {
        if (valRes.error.issues && valRes.error.issues.length > 0) {
          for (const iss of valRes.error.issues) {
            localIssues.push(iss);
            ctx.addIssue(iss);
          }
        } else {
          localIssues.push(valRes.error);
          ctx.addIssue(valRes.error);
        }

        if (ctx.options.abortEarly) {
          return ctx.fail(localIssues[0]);
        }
      } else {
        Object.defineProperty(output, finalKey, {
          value: valRes.value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }
    /* oxlint-enable no-await-in-loop */

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Record validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(output);
  }
}

/**
 * Creates a schema validator for dictionary/record objects with uniform value and optional key schemas.
 *
 * @typeParam TVal - Output type for every property value in the record.
 * @typeParam TKey - Output string key type in the record.
 * @param valueValidator - Validator schema applied to every value.
 * @param keyValidator - Optional validator schema applied to every key.
 * @returns A new RecordValidator instance.
 */
export function record<TVal, TKey extends string = string>(
  valueValidator: Validator<TVal>,
  keyValidator?: Validator<TKey>,
): RecordValidator<TVal, TKey> {
  return new RecordValidator(valueValidator, keyValidator);
}
