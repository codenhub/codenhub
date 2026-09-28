import { BaseValidator, type ValidationContext, type Validator } from "./core";
import { describeReceived, type ValidationIssue, type ValidationResult } from "./result";

type SetCheck = (input: Set<unknown>, ctx: ValidationContext) => ValidationIssue | undefined;

/**
 * Schema validator for JavaScript Set instances.
 *
 * Validates that input is a Set, applies size constraints, and optionally validates
 * every item within the Set against an element validator schema.
 *
 * @typeParam TItem - Element type within the set.
 */
export class SetValidator<TItem = unknown> extends BaseValidator<Set<TItem>, unknown> {
  /**
   * Constructs a SetValidator with an optional element validator schema and checks.
   *
   * @param itemValidator - Optional validator applied to each item in the set.
   * @param checks - Array of validation check functions.
   */
  constructor(
    private readonly itemValidator?: Validator<TItem>,
    private readonly checks: readonly SetCheck[] = [],
  ) {
    super();
  }

  /**
   * Returns the item validator schema if configured.
   */
  get element(): Validator<TItem> | undefined {
    return this.itemValidator;
  }

  private clone(check: SetCheck): SetValidator<TItem> {
    return new SetValidator(this.itemValidator, [...this.checks, check]);
  }

  /**
   * Enforces a minimum number of elements in the set.
   *
   * @param size - Minimum number of elements (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns A new immutable SetValidator with the constraint applied.
   */
  min(size: number, message?: string): SetValidator<TItem> {
    return this.clone((set, ctx) => {
      if (!Number.isFinite(size) || size < 0) {
        return {
          code: "invalid_value",
          message: "Minimum size must be a finite non-negative number",
          path: ctx.path,
        };
      }
      if (set.size < size) {
        return {
          code: "too_small",
          message: message ?? `Must contain at least ${size} items`,
          path: ctx.path,
          expected: `at least ${size} items`,
          received: `${set.size} items`,
          input: ctx.options.includeInput ? set : undefined,
        };
      }
      return undefined;
    });
  }

  /**
   * Enforces a maximum number of elements in the set.
   *
   * @param size - Maximum number of elements (finite non-negative number).
   * @param message - Optional custom failure message.
   * @returns A new immutable SetValidator with the constraint applied.
   */
  max(size: number, message?: string): SetValidator<TItem> {
    return this.clone((set, ctx) => {
      if (!Number.isFinite(size) || size < 0) {
        return {
          code: "invalid_value",
          message: "Maximum size must be a finite non-negative number",
          path: ctx.path,
        };
      }
      if (set.size > size) {
        return {
          code: "too_big",
          message: message ?? `Must contain at most ${size} items`,
          path: ctx.path,
          expected: `at most ${size} items`,
          received: `${set.size} items`,
          input: ctx.options.includeInput ? set : undefined,
        };
      }
      return undefined;
    });
  }

  /**
   * Enforces that the set contains at least one element.
   *
   * @param message - Optional custom failure message.
   * @returns A new immutable SetValidator with the constraint applied.
   */
  nonEmpty(message?: string): SetValidator<TItem> {
    return this.clone((set, ctx) => {
      if (set.size === 0) {
        return {
          code: "too_small",
          message: message ?? "Set cannot be empty",
          path: ctx.path,
          expected: "non-empty set",
          received: "empty set",
          input: ctx.options.includeInput ? set : undefined,
        };
      }
      return undefined;
    });
  }

  protected override isAsync(): boolean {
    return (
      this.itemValidator instanceof BaseValidator && (this.itemValidator as unknown as { isAsync(): boolean }).isAsync()
    );
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<Set<TItem>> {
    if (!(input instanceof Set)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected Set, got ${describeReceived(input)}`,
        expected: "Set",
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

    const output = new Set<TItem>();

    if (this.itemValidator !== undefined) {
      let index = 0;
      for (const item of input) {
        const childPath = [...ctx.path, index];
        const res = this.itemValidator.validate(item as TItem, {
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
          output.add(res.value);
        }
        index++;
      }
    } else {
      for (const item of input) {
        output.add(item as TItem);
      }
    }

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Set validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(output);
  }

  protected override async _validateAsync(
    input: unknown,
    ctx: ValidationContext,
  ): Promise<ValidationResult<Set<TItem>>> {
    if (!(input instanceof Set)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected Set, got ${describeReceived(input)}`,
        expected: "Set",
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

    const output = new Set<TItem>();

    if (this.itemValidator !== undefined) {
      let index = 0;
      /* oxlint-disable no-await-in-loop */
      for (const item of input) {
        const childPath = [...ctx.path, index];
        const res = await this.itemValidator.validateAsync(item as TItem, {
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
          output.add(res.value);
        }
        index++;
      }
      /* oxlint-enable no-await-in-loop */
    } else {
      for (const item of input) {
        output.add(item as TItem);
      }
    }

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Set validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(output);
  }
}

/**
 * Creates a schema validator for JavaScript Set instances.
 *
 * @typeParam TItem - Element type within the set.
 * @param itemValidator - Optional validator applied to each item.
 * @returns A new SetValidator instance.
 */
export function set<TItem = unknown>(itemValidator?: Validator<TItem>): SetValidator<TItem> {
  return new SetValidator(itemValidator);
}
