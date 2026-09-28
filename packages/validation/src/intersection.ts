import { BaseValidator, type ValidationContext, type Validator } from "./core";
import { isPlainObject } from "./object";
import { type ValidationIssue, type ValidationOk, type ValidationResult } from "./result";

declare module "./core" {
  interface Validator<TOutput, TInput = unknown> {
    /**
     * Combines this validator with another schema using an intersection.
     *
     * @typeParam TOther - Output type of the other validator.
     * @param other - Validator schema to intersect with.
     * @returns An intersection validator requiring both schemas to succeed.
     */
    and<TOther>(other: Validator<TOther>): IntersectionValidator<TOutput, TOther, TInput>;
  }
  interface BaseValidator<TOutput, TInput = unknown> {
    /**
     * Combines this validator with another schema using an intersection.
     *
     * @typeParam TOther - Output type of the other validator.
     * @param other - Validator schema to intersect with.
     * @returns An intersection validator requiring both schemas to succeed.
     */
    and<TOther>(other: Validator<TOther>): IntersectionValidator<TOutput, TOther, TInput>;
  }
}

/**
 * Recursively deep-merges two values, merging properties when both inputs are plain objects.
 *
 * @param target - Base value to merge into.
 * @param source - Incoming value to merge on top of target.
 * @returns The deep-merged value.
 */
export function deepMerge(target: unknown, source: unknown): unknown {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return source;
  }

  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(target)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    result[key] = val;
  }

  for (const [key, sourceVal] of Object.entries(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      const targetVal = result[key];
      if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
        result[key] = deepMerge(targetVal, sourceVal);
      } else {
        result[key] = sourceVal;
      }
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Schema validator that requires input to satisfy both of two sub-schemas.
 *
 * If both schemas produce plain objects, their properties are deeply merged.
 *
 * @typeParam TLeft - Output type of the left validator.
 * @typeParam TRight - Output type of the right validator.
 * @typeParam TInput - Input type accepted by both validators.
 */
export class IntersectionValidator<TLeft, TRight, TInput = unknown> extends BaseValidator<TLeft & TRight, TInput> {
  /**
   * Constructs an IntersectionValidator combining two schemas.
   *
   * @param left - First schema validator.
   * @param right - Second schema validator.
   */
  constructor(
    readonly left: Validator<TLeft, TInput>,
    readonly right: Validator<TRight, TInput>,
  ) {
    super();
  }

  protected override isAsync(): boolean {
    const leftAsync = this.left instanceof BaseValidator && (this.left as unknown as { isAsync(): boolean }).isAsync();
    const rightAsync =
      this.right instanceof BaseValidator && (this.right as unknown as { isAsync(): boolean }).isAsync();
    return leftAsync || rightAsync;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TLeft & TRight> {
    const leftRes = (this.left as Validator<unknown, unknown>).validate(input, {
      ...ctx.options,
      path: ctx.path,
    });

    if (!leftRes.ok && ctx.options.abortEarly) {
      if (leftRes.error.issues && leftRes.error.issues.length > 0) {
        for (const iss of leftRes.error.issues) {
          ctx.addIssue(iss);
        }
      } else {
        ctx.addIssue(leftRes.error);
      }
      return leftRes as ValidationResult<TLeft & TRight>;
    }

    const rightRes = (this.right as Validator<unknown, unknown>).validate(input, {
      ...ctx.options,
      path: ctx.path,
    });

    const localIssues: ValidationIssue[] = [];

    if (!leftRes.ok) {
      if (leftRes.error.issues && leftRes.error.issues.length > 0) {
        localIssues.push(...leftRes.error.issues);
      } else {
        localIssues.push(leftRes.error);
      }
    }

    if (!rightRes.ok) {
      if (rightRes.error.issues && rightRes.error.issues.length > 0) {
        localIssues.push(...rightRes.error.issues);
      } else {
        localIssues.push(rightRes.error);
      }
    }

    if (localIssues.length > 0) {
      for (const iss of localIssues) {
        ctx.addIssue(iss);
      }
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Intersection validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    const merged = deepMerge((leftRes as ValidationOk<unknown>).value, (rightRes as ValidationOk<unknown>).value);
    return ctx.ok(merged as TLeft & TRight);
  }

  protected override async _validateAsync(
    input: unknown,
    ctx: ValidationContext,
  ): Promise<ValidationResult<TLeft & TRight>> {
    let leftRes: ValidationResult<TLeft>;
    let rightRes: ValidationResult<TRight>;

    if (ctx.options.abortEarly) {
      leftRes = await (this.left as Validator<TLeft, unknown>).validateAsync(input, {
        ...ctx.options,
        path: ctx.path,
      });

      if (!leftRes.ok) {
        if (leftRes.error.issues && leftRes.error.issues.length > 0) {
          for (const iss of leftRes.error.issues) {
            ctx.addIssue(iss);
          }
        } else {
          ctx.addIssue(leftRes.error);
        }
        return leftRes as unknown as ValidationResult<TLeft & TRight>;
      }

      rightRes = await (this.right as Validator<TRight, unknown>).validateAsync(input, {
        ...ctx.options,
        path: ctx.path,
      });
    } else {
      [leftRes, rightRes] = await Promise.all([
        (this.left as Validator<TLeft, unknown>).validateAsync(input, {
          ...ctx.options,
          path: ctx.path,
        }),
        (this.right as Validator<TRight, unknown>).validateAsync(input, {
          ...ctx.options,
          path: ctx.path,
        }),
      ]);
    }

    const localIssues: ValidationIssue[] = [];

    if (!leftRes.ok) {
      if (leftRes.error.issues && leftRes.error.issues.length > 0) {
        localIssues.push(...leftRes.error.issues);
      } else {
        localIssues.push(leftRes.error);
      }
    }

    if (!rightRes.ok) {
      if (rightRes.error.issues && rightRes.error.issues.length > 0) {
        localIssues.push(...rightRes.error.issues);
      } else {
        localIssues.push(rightRes.error);
      }
    }

    if (localIssues.length > 0) {
      for (const iss of localIssues) {
        ctx.addIssue(iss);
      }
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Intersection validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    const merged = deepMerge((leftRes as ValidationOk<unknown>).value, (rightRes as ValidationOk<unknown>).value);
    return ctx.ok(merged as TLeft & TRight);
  }
}

BaseValidator.prototype.and = function <TOutput, TInput, TOther>(
  this: BaseValidator<TOutput, TInput>,
  other: Validator<TOther>,
): IntersectionValidator<TOutput, TOther, TInput> {
  return new IntersectionValidator(
    this as unknown as Validator<TOutput, TInput>,
    other as unknown as Validator<TOther, TInput>,
  );
};

/**
 * Creates an intersection schema validator requiring input to satisfy two sub-schemas.
 *
 * @typeParam TLeft - Output type of the first schema.
 * @typeParam TRight - Output type of the second schema.
 * @param left - First schema validator.
 * @param right - Second schema validator.
 * @returns A new IntersectionValidator instance.
 */
export function intersection<TLeft, TRight>(
  left: Validator<TLeft>,
  right: Validator<TRight>,
): IntersectionValidator<TLeft, TRight> {
  return new IntersectionValidator(left, right);
}
