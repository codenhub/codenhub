import { BaseValidator, type ValidationContext, type Validator } from "./core";
import { type ValidationResult } from "./result";

/**
 * Schema validator that defers schema resolution until validation time.
 *
 * Enables validation of recursive or self-referential data structures, such
 * as nested trees or comments with sub-comments.
 *
 * @typeParam TOutput - Output type produced by the deferred schema.
 * @typeParam TInput - Input type accepted by the deferred schema.
 */
export class LazyValidator<TOutput, TInput = unknown> extends BaseValidator<TOutput, TInput> {
  private resolved?: Validator<TOutput, TInput>;
  private isEvaluatingAsync = false;

  /**
   * Constructs a LazyValidator with a schema getter function.
   *
   * @param getter - Function returning the target schema validator when called.
   */
  constructor(private readonly getter: () => Validator<TOutput, TInput>) {
    super();
  }

  /**
   * Resolves and caches the underlying schema validator.
   */
  get schema(): Validator<TOutput, TInput> {
    if (this.resolved === undefined) {
      this.resolved = this.getter();
    }
    return this.resolved;
  }

  protected override isAsync(): boolean {
    if (this.isEvaluatingAsync) {
      return false;
    }
    this.isEvaluatingAsync = true;
    try {
      const s = this.schema;
      return s instanceof BaseValidator ? (s as unknown as { isAsync(): boolean }).isAsync() : false;
    } finally {
      this.isEvaluatingAsync = false;
    }
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
    return (this.schema as Validator<TOutput, unknown>).validate(input as TInput, {
      ...ctx.options,
      path: ctx.path,
    });
  }

  protected override async _validateAsync(input: unknown, ctx: ValidationContext): Promise<ValidationResult<TOutput>> {
    return (this.schema as Validator<TOutput, unknown>).validateAsync(input as TInput, {
      ...ctx.options,
      path: ctx.path,
    });
  }
}

/**
 * Creates a schema validator that defers resolution until validation time.
 *
 * @typeParam T - Type produced by the resolved schema validator.
 * @param getter - Function returning the schema validator.
 * @returns A new LazyValidator instance.
 */
export function lazy<T>(getter: () => Validator<T>): LazyValidator<T> {
  return new LazyValidator(getter);
}
