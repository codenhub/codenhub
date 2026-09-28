import { BaseValidator, type ValidationContext, type Validator } from "./core";
import { describeReceived, type ValidationIssue, type ValidationResult } from "./result";

type MapCheck = (input: Map<unknown, unknown>, ctx: ValidationContext) => ValidationIssue | undefined;

/**
 * Schema validator for JavaScript Map instances.
 *
 * Validates that input is a Map, applies size constraints, and validates every
 * key and value entry against their respective schemas.
 *
 * @typeParam TKey - Map key type.
 * @typeParam TValue - Map value type.
 */
export class MapValidator<TKey, TValue> extends BaseValidator<Map<TKey, TValue>, unknown> {
  /**
   * Constructs a MapValidator with key/value validators and checks.
   *
   * @param keyValidator - Validator schema applied to each map key.
   * @param valueValidator - Validator schema applied to each map value.
   * @param checks - Array of validation check functions.
   */
  constructor(
    private readonly keyValidator: Validator<TKey>,
    private readonly valueValidator: Validator<TValue>,
    private readonly checks: readonly MapCheck[] = [],
  ) {
    super();
  }

  /**
   * Returns the key validator schema.
   */
  get key(): Validator<TKey> {
    return this.keyValidator;
  }

  /**
   * Returns the value validator schema.
   */
  get value(): Validator<TValue> {
    return this.valueValidator;
  }

  private clone(check: MapCheck): MapValidator<TKey, TValue> {
    return new MapValidator(this.keyValidator, this.valueValidator, [...this.checks, check]);
  }

  /**
   * Enforces a minimum number of entries in the map.
   *
   * @param size - Minimum number of entries (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns A new immutable MapValidator with the constraint applied.
   */
  min(size: number, message?: string): MapValidator<TKey, TValue> {
    return this.clone((map, ctx) => {
      if (!Number.isFinite(size) || size < 0) {
        return {
          code: "invalid_value",
          message: "Minimum size must be a finite non-negative number",
          path: ctx.path,
        };
      }
      if (map.size < size) {
        return {
          code: "too_small",
          message: message ?? `Must contain at least ${size} entries`,
          path: ctx.path,
          expected: `at least ${size} entries`,
          received: `${map.size} entries`,
          input: ctx.options.includeInput ? map : undefined,
        };
      }
      return undefined;
    });
  }

  /**
   * Enforces a maximum number of entries in the map.
   *
   * @param size - Maximum number of entries (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns A new immutable MapValidator with the constraint applied.
   */
  max(size: number, message?: string): MapValidator<TKey, TValue> {
    return this.clone((map, ctx) => {
      if (!Number.isFinite(size) || size < 0) {
        return {
          code: "invalid_value",
          message: "Maximum size must be a finite non-negative number",
          path: ctx.path,
        };
      }
      if (map.size > size) {
        return {
          code: "too_big",
          message: message ?? `Must contain at most ${size} entries`,
          path: ctx.path,
          expected: `at most ${size} entries`,
          received: `${map.size} entries`,
          input: ctx.options.includeInput ? map : undefined,
        };
      }
      return undefined;
    });
  }

  /**
   * Enforces that the map contains at least one entry.
   *
   * @param message - Optional custom failure message.
   * @returns A new immutable MapValidator with the constraint applied.
   */
  nonEmpty(message?: string): MapValidator<TKey, TValue> {
    return this.clone((map, ctx) => {
      if (map.size === 0) {
        return {
          code: "too_small",
          message: message ?? "Map cannot be empty",
          path: ctx.path,
          expected: "non-empty map",
          received: "empty map",
          input: ctx.options.includeInput ? map : undefined,
        };
      }
      return undefined;
    });
  }

  protected override isAsync(): boolean {
    const keyAsync =
      this.keyValidator instanceof BaseValidator && (this.keyValidator as unknown as { isAsync(): boolean }).isAsync();
    const valAsync =
      this.valueValidator instanceof BaseValidator &&
      (this.valueValidator as unknown as { isAsync(): boolean }).isAsync();
    return keyAsync || valAsync;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<Map<TKey, TValue>> {
    if (!(input instanceof Map)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected Map, got ${describeReceived(input)}`,
        expected: "Map",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    const localIssues: ValidationIssue[] = [];

    for (const check of this.checks) {
      const issue = check(input, ctx);
      if (issue !== undefined) {
        localIssues.push(issue);
        ctx.addIssue(issue);
        if (ctx.options.abortEarly) {
          return ctx.fail(issue);
        }
      }
    }

    const output = new Map<TKey, TValue>();
    let index = 0;

    for (const [rawKey, rawVal] of input) {
      const entryKey = typeof rawKey === "string" || typeof rawKey === "number" ? rawKey : index;
      const keyRes = this.keyValidator.validate(rawKey as TKey, {
        ...ctx.options,
        path: [...ctx.path, entryKey],
      });

      let finalKey = rawKey as TKey;

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

      const valRes = this.valueValidator.validate(rawVal as TValue, {
        ...ctx.options,
        path: [...ctx.path, entryKey],
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
      } else if (keyRes.ok) {
        output.set(finalKey, valRes.value);
      }

      index++;
    }

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Map validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(output);
  }

  protected override async _validateAsync(
    input: unknown,
    ctx: ValidationContext,
  ): Promise<ValidationResult<Map<TKey, TValue>>> {
    if (!(input instanceof Map)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected Map, got ${describeReceived(input)}`,
        expected: "Map",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    const localIssues: ValidationIssue[] = [];

    for (const check of this.checks) {
      const issue = check(input, ctx);
      if (issue !== undefined) {
        localIssues.push(issue);
        ctx.addIssue(issue);
        if (ctx.options.abortEarly) {
          return ctx.fail(issue);
        }
      }
    }

    const output = new Map<TKey, TValue>();
    let index = 0;

    /* oxlint-disable no-await-in-loop */
    for (const [rawKey, rawVal] of input) {
      const entryKey = typeof rawKey === "string" || typeof rawKey === "number" ? rawKey : index;
      const keyRes = await this.keyValidator.validateAsync(rawKey as TKey, {
        ...ctx.options,
        path: [...ctx.path, entryKey],
      });

      let finalKey = rawKey as TKey;

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

      const valRes = await this.valueValidator.validateAsync(rawVal as TValue, {
        ...ctx.options,
        path: [...ctx.path, entryKey],
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
      } else if (keyRes.ok) {
        output.set(finalKey, valRes.value);
      }

      index++;
    }
    /* oxlint-enable no-await-in-loop */

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Map validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(output);
  }
}

/**
 * Creates a schema validator for JavaScript Map instances with key and value schemas.
 *
 * @typeParam TKey - Map key type.
 * @typeParam TValue - Map value type.
 * @param keyValidator - Validator schema applied to keys.
 * @param valueValidator - Validator schema applied to values.
 * @returns A new MapValidator instance.
 */
export function map<TKey, TValue>(
  keyValidator: Validator<TKey>,
  valueValidator: Validator<TValue>,
): MapValidator<TKey, TValue> {
  return new MapValidator(keyValidator, valueValidator);
}
