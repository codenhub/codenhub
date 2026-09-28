import { BaseValidator, type ValidationContext } from "./core";
import {
  normalizeError,
  parseResult,
  type ValidationIssue,
  type ValidationOptions,
  type ValidationResult,
} from "./result";

/**
 * Signature for a custom validator callback function.
 *
 * @typeParam TOutput - Output type produced by the custom check.
 * @typeParam TInput - Input type received by the custom check.
 */
export type CustomValidatorFn<TOutput, TInput = unknown> = (
  input: TInput,
  ctx: ValidationContext,
) => ValidationResult<TOutput> | TOutput | boolean | string | void;

/**
 * Schema validator executing arbitrary custom validation functions.
 *
 * Supports boolean returns, string error messages, ValidationResult objects,
 * thrown errors, and context-based issue registration.
 *
 * @typeParam TOutput - The validated output type.
 * @typeParam TInput - The accepted input type.
 */
export class CustomValidator<TOutput, TInput = unknown> extends BaseValidator<TOutput, TInput> {
  /**
   * Constructs a CustomValidator with the user-defined validation function.
   *
   * @param fn - The custom validation function to run on input.
   */
  constructor(private readonly fn: CustomValidatorFn<TOutput, TInput>) {
    super();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
    try {
      const res = this.fn(input as TInput, ctx);

      if (typeof res === "boolean") {
        if (res) {
          return ctx.ok(input as unknown as TOutput);
        }
        return ctx.fail({
          code: "custom",
          message: "Custom validation failed",
          path: ctx.path,
          input: ctx.options.includeInput ? input : undefined,
        });
      }

      if (typeof res === "string") {
        return ctx.fail({
          code: "custom",
          message: res,
          path: ctx.path,
          input: ctx.options.includeInput ? input : undefined,
        });
      }

      if (res !== null && typeof res === "object" && "ok" in res) {
        const parsed = parseResult<TOutput>(res);
        if (!parsed.ok) {
          return ctx.fail(parsed.error);
        }
        return ctx.ok(parsed.value);
      }

      if (res === undefined) {
        if ("issues" in ctx && Array.isArray((ctx as unknown as { issues: unknown[] }).issues)) {
          const issuesList = (ctx as unknown as { issues: ValidationIssue[] }).issues;
          if (issuesList.length > 0 && issuesList[0] !== undefined) {
            return ctx.fail(issuesList[0]);
          }
        }
        return ctx.ok(input as unknown as TOutput);
      }

      return ctx.ok(res as TOutput);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      return ctx.fail({
        code: "custom",
        message,
        path: ctx.path,
        input: ctx.options.includeInput ? input : undefined,
      });
    }
  }
}

/** Legacy custom runner implementation for 0.0.1 compatibility. */
function legacyCustom<T>(
  value: unknown,
  validator: (value: unknown) => unknown,
  options: ValidationOptions = {},
): ValidationResult<T> {
  try {
    const result = parseResult<T>(validator(value));

    if (result.ok) {
      return result;
    }

    return { ok: false, error: normalizeError(result.error, options) };
  } catch (error) {
    return { ok: false, error: normalizeError(error, options) };
  }
}

/**
 * Creates a custom schema validator from a custom check function.
 *
 * @typeParam TOutput - Output type produced by the custom validator.
 * @typeParam TInput - Accepted input type.
 * @param validator - Function performing the custom validation logic.
 * @returns A new CustomValidator schema instance.
 */
export function custom<TOutput, TInput = unknown>(
  validator: (input: TInput, ctx: ValidationContext) => unknown,
): CustomValidator<TOutput, TInput>;
/**
 * Runs a custom validator on an input value immediately (legacy runner).
 *
 * @typeParam T - Output type of the validation result.
 * @param value - The input value to validate.
 * @param validator - The validation callback function.
 * @param options - Optional validation options.
 * @returns A ValidationResult indicating success or failure.
 */
export function custom<T>(
  value: unknown,
  validator: (value: unknown) => unknown,
  options?: ValidationOptions,
): ValidationResult<T>;
/**
 * Overloaded custom validator factory or legacy immediate evaluator.
 *
 * @param arg0 - Validator function or target value to validate.
 * @param arg1 - Validation function or options.
 * @param arg2 - Optional validation options.
 * @returns A CustomValidator instance or ValidationResult.
 */
export function custom(
  arg0: unknown,
  arg1?: unknown,
  arg2?: ValidationOptions,
): CustomValidator<unknown, unknown> | ValidationResult<unknown> {
  if (typeof arg0 === "function" && typeof arg1 !== "function") {
    return new CustomValidator(arg0 as CustomValidatorFn<unknown, unknown>);
  }

  return legacyCustom(arg0, arg1 as (value: unknown) => unknown, arg2);
}
