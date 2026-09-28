import { BaseValidator, type Infer, type ValidationContext, type Validator } from "./core";
import { type ValidationIssue, type ValidationResult } from "./result";

/**
 * Schema validator for union types that match against any of several alternative schemas.
 *
 * Evaluates variants in sequence. The first variant that successfully validates the input
 * produces the result. If all variants fail, aggregated failure issues from every branch are reported.
 *
 * @typeParam TVariants - Array of candidate variant schemas.
 */
export class UnionValidator<TVariants extends readonly Validator<unknown>[]> extends BaseValidator<
  Infer<TVariants[number]>,
  unknown
> {
  /**
   * Constructs a UnionValidator with a list of candidate variant schemas.
   *
   * @param _variants - Array of candidate validators tested in order.
   */
  constructor(protected readonly _variants: TVariants) {
    super();
  }

  /**
   * Returns the candidate variant schemas.
   */
  get variants(): TVariants {
    return this._variants;
  }

  protected override isAsync(): boolean {
    return this._variants.some((v) => v instanceof BaseValidator && (v as unknown as { isAsync(): boolean }).isAsync());
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<Infer<TVariants[number]>> {
    const branchIssues: ValidationIssue[] = [];

    for (const variant of this._variants) {
      const res = (variant as Validator<unknown, unknown>).validate(input, {
        ...ctx.options,
        path: ctx.path,
      });

      if (res.ok) {
        return ctx.ok(res.value as Infer<TVariants[number]>);
      }

      if (res.error.issues && res.error.issues.length > 0) {
        branchIssues.push(...res.error.issues);
      } else {
        branchIssues.push(res.error);
      }
    }

    const mainIssue: ValidationIssue = {
      code: "invalid_value",
      message: "Invalid union value: did not match any allowed variant",
      path: ctx.path,
      input: ctx.options.includeInput ? input : undefined,
    };

    ctx.addIssue(mainIssue);
    for (const iss of branchIssues) {
      ctx.addIssue(iss);
    }

    return ctx.fail({
      code: "invalid_value",
      message: "Invalid union value: did not match any allowed variant",
      path: ctx.path,
      input: ctx.options.includeInput ? input : undefined,
      issues: branchIssues,
    });
  }

  protected override async _validateAsync(
    input: unknown,
    ctx: ValidationContext,
  ): Promise<ValidationResult<Infer<TVariants[number]>>> {
    const branchIssues: ValidationIssue[] = [];

    /* oxlint-disable no-await-in-loop */
    for (const variant of this._variants) {
      const res = await (variant as Validator<unknown, unknown>).validateAsync(input, {
        ...ctx.options,
        path: ctx.path,
      });

      if (res.ok) {
        return ctx.ok(res.value as Infer<TVariants[number]>);
      }

      if (res.error.issues && res.error.issues.length > 0) {
        branchIssues.push(...res.error.issues);
      } else {
        branchIssues.push(res.error);
      }
    }
    /* oxlint-enable no-await-in-loop */

    const mainIssue: ValidationIssue = {
      code: "invalid_value",
      message: "Invalid union value: did not match any allowed variant",
      path: ctx.path,
      input: ctx.options.includeInput ? input : undefined,
    };

    ctx.addIssue(mainIssue);
    for (const iss of branchIssues) {
      ctx.addIssue(iss);
    }

    return ctx.fail({
      code: "invalid_value",
      message: "Invalid union value: did not match any allowed variant",
      path: ctx.path,
      input: ctx.options.includeInput ? input : undefined,
      issues: branchIssues,
    });
  }
}

/**
 * Creates a schema validator that matches input against any of the given variant schemas.
 *
 * @typeParam TVariants - Array of candidate variant validators.
 * @param variants - Array of variant schemas tested in order.
 * @returns A new UnionValidator instance.
 */
export function union<TVariants extends readonly [Validator<unknown>, ...Validator<unknown>[]]>(
  variants: TVariants,
): UnionValidator<TVariants> {
  return new UnionValidator(variants);
}
