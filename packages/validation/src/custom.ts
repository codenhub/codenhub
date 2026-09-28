import { BaseValidator, type ValidationContext } from "./core";
import { parseResult, type ValidationIssue, type ValidationResult } from "./result";

/**
 * Signature for a custom validator callback function.
 *
 * @typeParam TOutput - Output type produced by the custom check.
 * @typeParam TInput - Input type received by the custom check.
 */
export type CustomValidatorFn<TOutput, TInput = unknown> = (
  input: TInput,
  ctx: ValidationContext,
) =>
  | ValidationResult<TOutput>
  | TOutput
  | boolean
  | string
  | void
  | Promise<ValidationResult<TOutput> | TOutput | boolean | string | void>;

/**
 * Schema validator executing arbitrary custom validation functions.
 *
 * Supports boolean returns, string error messages, ValidationResult objects,
 * thrown errors, and context-based issue registration. Both synchronous and asynchronous
 * validation functions are supported.
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

  protected override isAsync(): boolean {
    return this.fn.constructor?.name === "AsyncFunction";
  }

  private handleSyncResult(res: unknown, input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
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
        const errorPath = parsed.error.path && parsed.error.path.length > 0 ? parsed.error.path : ctx.path;
        return ctx.fail({
          ...parsed.error,
          path: errorPath,
        });
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
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
    let res: unknown;
    try {
      res = this.fn(input as TInput, ctx);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      return ctx.fail({
        code: "custom",
        message,
        path: ctx.path,
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    if (
      res instanceof Promise ||
      (typeof res === "object" && res !== null && typeof (res as Promise<unknown>).then === "function")
    ) {
      return ctx.fail({
        code: "custom",
        message: "Async custom validator requires validateAsync()",
        path: ctx.path,
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    return this.handleSyncResult(res, input, ctx);
  }

  protected override async _validateAsync(input: unknown, ctx: ValidationContext): Promise<ValidationResult<TOutput>> {
    let res: unknown;
    try {
      res = await this.fn(input as TInput, ctx);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      return ctx.fail({
        code: "custom",
        message,
        path: ctx.path,
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    return this.handleSyncResult(res, input, ctx);
  }
}

/**
 * Creates a custom schema validator from a custom check function.
 *
 * @typeParam TOutput - Output type produced by the custom validator.
 * @typeParam TInput - Accepted input type.
 * @param fn - Function performing the custom validation logic.
 * @returns A new CustomValidator schema instance.
 */
export function custom<TOutput, TInput = unknown>(
  fn: CustomValidatorFn<TOutput, TInput>,
): CustomValidator<TOutput, TInput> {
  return new CustomValidator(fn);
}
