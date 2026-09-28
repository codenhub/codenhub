import { BaseValidator, type ValidationContext, type Validator } from "./core";
import { describeReceived, type ValidationIssue, type ValidationResult } from "./result";

const isValidLengthLimit = (value: number): boolean => Number.isFinite(value) && value >= 0;

type ArrayCheck = (input: unknown[], ctx: ValidationContext) => ValidationIssue | ValidationIssue[] | undefined;
type UniquenessCheck<TItem> = (
  items: TItem[],
  ctx: ValidationContext,
) => ValidationIssue | ValidationIssue[] | undefined;

/**
 * Schema validator for array structures and element validation.
 *
 * Supports length constraints, empty checks, element uniqueness, and recursive
 * element validation with item-level path tracking. All modifier methods return
 * new immutable instances.
 *
 * @typeParam TItem - The type of elements validated inside the array.
 */
export class ArrayValidator<TItem = unknown> extends BaseValidator<TItem[], unknown> {
  /**
   * Constructs an ArrayValidator with an optional element validator schema and checks.
   *
   * @param elementValidator - Optional validator applied to every element of the array.
   * @param checks - Array of validation check functions.
   * @param uniquenessChecks - Array of uniqueness check functions evaluated after element validation.
   */
  constructor(
    private readonly elementValidator?: Validator<TItem>,
    private readonly checks: readonly ArrayCheck[] = [],
    private readonly uniquenessChecks: readonly UniquenessCheck<TItem>[] = [],
  ) {
    super();
  }

  /**
   * Returns the element validator schema if one was provided.
   */
  get element(): Validator<TItem> | undefined {
    return this.elementValidator;
  }

  private clone(check: ArrayCheck): ArrayValidator<TItem> {
    return new ArrayValidator(this.elementValidator, [...this.checks, check], this.uniquenessChecks);
  }

  /**
   * Enforces a minimum array length.
   *
   * @param length - Minimum number of elements (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns A new immutable ArrayValidator with the constraint applied.
   */
  min(length: number, message?: string): ArrayValidator<TItem> {
    return this.clone((arr, ctx) => {
      if (!isValidLengthLimit(length)) {
        return {
          code: "invalid_value",
          message: "Minimum length must be a finite non-negative number",
          path: ctx.path,
        };
      }
      if (arr.length < length) {
        return {
          code: "too_small",
          message: message ?? `Must contain at least ${length} items`,
          path: ctx.path,
          expected: `at least ${length} items`,
          received: `${arr.length} items`,
          input: ctx.options.includeInput ? arr : undefined,
        };
      }
      return undefined;
    });
  }

  /**
   * Enforces a maximum array length.
   *
   * @param length - Maximum number of elements (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns A new immutable ArrayValidator with the constraint applied.
   */
  max(length: number, message?: string): ArrayValidator<TItem> {
    return this.clone((arr, ctx) => {
      if (!isValidLengthLimit(length)) {
        return {
          code: "invalid_value",
          message: "Maximum length must be a finite non-negative number",
          path: ctx.path,
        };
      }
      if (arr.length > length) {
        return {
          code: "too_big",
          message: message ?? `Must contain at most ${length} items`,
          path: ctx.path,
          expected: `at most ${length} items`,
          received: `${arr.length} items`,
          input: ctx.options.includeInput ? arr : undefined,
        };
      }
      return undefined;
    });
  }

  /**
   * Enforces an exact array length.
   *
   * @param length - Exact required element count (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns A new immutable ArrayValidator with the constraint applied.
   */
  length(length: number, message?: string): ArrayValidator<TItem> {
    return this.clone((arr, ctx) => {
      if (!isValidLengthLimit(length)) {
        return {
          code: "invalid_value",
          message: "Length must be a finite non-negative number",
          path: ctx.path,
        };
      }
      if (arr.length !== length) {
        return {
          code: "invalid_value",
          message: message ?? `Must contain exactly ${length} items`,
          path: ctx.path,
          expected: `${length} items`,
          received: `${arr.length} items`,
          input: ctx.options.includeInput ? arr : undefined,
        };
      }
      return undefined;
    });
  }

  /**
   * Enforces that the array is not empty.
   *
   * @param message - Optional custom failure message.
   * @returns A new immutable ArrayValidator with the constraint applied.
   */
  nonEmpty(message?: string): ArrayValidator<TItem> {
    return this.clone((arr, ctx) => {
      if (arr.length === 0) {
        return {
          code: "too_small",
          message: message ?? "Array cannot be empty",
          path: ctx.path,
          expected: "non-empty array",
          received: "empty array",
          input: ctx.options.includeInput ? arr : undefined,
        };
      }
      return undefined;
    });
  }

  /**
   * Enforces uniqueness of elements, either by value equality or by a key selector function.
   *
   * @param keySelector - Optional function projecting an item to a uniqueness key.
   * @param message - Optional custom failure message.
   * @returns A new immutable ArrayValidator with the uniqueness constraint applied.
   */
  unique(keySelector?: (item: TItem) => unknown, message?: string): ArrayValidator<TItem> {
    const check: UniquenessCheck<TItem> = (arr, ctx) => {
      const seen = new Set<unknown>();
      const issues: ValidationIssue[] = [];

      for (let i = 0; i < arr.length; i++) {
        const item = arr[i] as TItem;
        const key = keySelector ? keySelector(item) : item;
        if (seen.has(key)) {
          const issue: ValidationIssue = {
            code: "invalid_value",
            message: message ?? `Duplicate element at index ${i}`,
            path: [...ctx.path, i],
            expected: "unique elements",
            received: describeReceived(item),
            input: ctx.options.includeInput ? item : undefined,
          };
          if (ctx.options.abortEarly) {
            return issue;
          }
          issues.push(issue);
        } else {
          seen.add(key);
        }
      }

      return issues.length > 0 ? issues : undefined;
    };

    return new ArrayValidator(this.elementValidator, this.checks, [...this.uniquenessChecks, check]);
  }

  /**
   * Alias for {@link ArrayValidator.min}.
   *
   * @param length - Minimum element count.
   * @param options - Optional configuration or custom error message string.
   * @returns A new immutable ArrayValidator with the constraint applied.
   */
  minLength(length: number, options?: { message?: string } | string): ArrayValidator<TItem> {
    const msg = typeof options === "string" ? options : options?.message;
    return this.min(length, msg);
  }

  /**
   * Alias for {@link ArrayValidator.max}.
   *
   * @param length - Maximum element count.
   * @param options - Optional configuration or custom error message string.
   * @returns A new immutable ArrayValidator with the constraint applied.
   */
  maxLength(length: number, options?: { message?: string } | string): ArrayValidator<TItem> {
    const msg = typeof options === "string" ? options : options?.message;
    return this.max(length, msg);
  }

  /**
   * Alias for {@link ArrayValidator.nonEmpty}.
   *
   * @param options - Optional configuration or custom error message string.
   * @returns A new immutable ArrayValidator with the constraint applied.
   */
  notEmpty(options?: { message?: string } | string): ArrayValidator<TItem> {
    const msg = typeof options === "string" ? options : options?.message;
    return this.nonEmpty(msg);
  }

  protected override isAsync(): boolean {
    return (
      this.elementValidator instanceof BaseValidator &&
      (this.elementValidator as unknown as { isAsync(): boolean }).isAsync()
    );
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TItem[]> {
    if (!Array.isArray(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected array, got ${describeReceived(input)}`,
        expected: "array",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    const localIssues: ValidationIssue[] = [];

    for (const check of this.checks) {
      const result = check(input, ctx);
      if (result !== undefined) {
        const issues = Array.isArray(result) ? result : [result];
        for (const issue of issues) {
          localIssues.push(issue);
          ctx.addIssue(issue);
          if (ctx.options.abortEarly) {
            return ctx.fail(issue);
          }
        }
      }
    }

    const output: TItem[] = [];

    if (this.elementValidator !== undefined) {
      for (let i = 0; i < input.length; i++) {
        const item = input[i];
        const childPath = [...ctx.path, i];
        const res = this.elementValidator.validate(item as TItem, {
          ...ctx.options,
          path: childPath,
        });

        if (!res.ok) {
          if (res.error.issues && res.error.issues.length > 0) {
            for (const iss of res.error.issues) {
              localIssues.push(iss);
              ctx.addIssue(iss);
            }
          } else {
            localIssues.push(res.error);
            ctx.addIssue(res.error);
          }

          if (ctx.options.abortEarly) {
            return ctx.fail(localIssues[0]);
          }
        } else {
          output.push(res.value);
        }
      }
    }

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Array validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    const validatedItems = this.elementValidator !== undefined ? output : (input as TItem[]);

    for (const check of this.uniquenessChecks) {
      const result = check(validatedItems, ctx);
      if (result !== undefined) {
        const issues = Array.isArray(result) ? result : [result];
        for (const issue of issues) {
          localIssues.push(issue);
          ctx.addIssue(issue);
          if (ctx.options.abortEarly) {
            return ctx.fail(issue);
          }
        }
      }
    }

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Array validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(validatedItems);
  }

  protected override async _validateAsync(input: unknown, ctx: ValidationContext): Promise<ValidationResult<TItem[]>> {
    if (!Array.isArray(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected array, got ${describeReceived(input)}`,
        expected: "array",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    const localIssues: ValidationIssue[] = [];

    for (const check of this.checks) {
      const result = check(input, ctx);
      if (result !== undefined) {
        const issues = Array.isArray(result) ? result : [result];
        for (const issue of issues) {
          localIssues.push(issue);
          ctx.addIssue(issue);
          if (ctx.options.abortEarly) {
            return ctx.fail(issue);
          }
        }
      }
    }

    const output: TItem[] = [];

    if (this.elementValidator !== undefined) {
      /* oxlint-disable no-await-in-loop */
      for (let i = 0; i < input.length; i++) {
        const item = input[i];
        const childPath = [...ctx.path, i];
        const res = await this.elementValidator.validateAsync(item as TItem, {
          ...ctx.options,
          path: childPath,
        });

        if (!res.ok) {
          if (res.error.issues && res.error.issues.length > 0) {
            for (const iss of res.error.issues) {
              localIssues.push(iss);
              ctx.addIssue(iss);
            }
          } else {
            localIssues.push(res.error);
            ctx.addIssue(res.error);
          }

          if (ctx.options.abortEarly) {
            return ctx.fail(localIssues[0]);
          }
        } else {
          output.push(res.value);
        }
      }
      /* oxlint-enable no-await-in-loop */
    }

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Array validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    const validatedItems = this.elementValidator !== undefined ? output : (input as TItem[]);

    for (const check of this.uniquenessChecks) {
      const result = check(validatedItems, ctx);
      if (result !== undefined) {
        const issues = Array.isArray(result) ? result : [result];
        for (const issue of issues) {
          localIssues.push(issue);
          ctx.addIssue(issue);
          if (ctx.options.abortEarly) {
            return ctx.fail(issue);
          }
        }
      }
    }

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Array validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(validatedItems);
  }
}

/**
 * Creates an array schema validator for elements matching the given item schema.
 *
 * @typeParam TItem - Element type validated by the child schema.
 * @param elementValidator - Optional validator schema applied to each element.
 * @returns A new ArrayValidator instance.
 */
export function array<TItem = unknown>(elementValidator?: Validator<TItem>): ArrayValidator<TItem> {
  return new ArrayValidator(elementValidator);
}
