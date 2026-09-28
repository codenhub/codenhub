import { BaseValidator, type ValidationContext, type Validator } from "./core";
import { type ValidationResult } from "./result";

/**
 * Sequential pipeline validator chaining multiple validators.
 *
 * @typeParam TOutput - Final output type produced by the pipeline.
 * @typeParam TInput - Initial input type accepted by the first validator.
 */
export class PipedValidator<TOutput, TInput = unknown> extends BaseValidator<TOutput, TInput> {
  /**
   * Constructs a PipedValidator from an array of validators.
   *
   * @param validators - Ordered array of validators to chain.
   */
  constructor(readonly validators: readonly Validator<unknown, unknown>[]) {
    super();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<TOutput> {
    let current: unknown = input;

    for (const validator of this.validators) {
      const res = (validator as Validator<unknown, unknown>).validate(current, {
        ...ctx.options,
        path: ctx.path,
      });

      if (!res.ok) {
        if (res.error.issues && res.error.issues.length > 0) {
          for (const iss of res.error.issues) {
            ctx.addIssue(iss);
          }
        } else {
          ctx.addIssue(res.error);
        }
        return res as ValidationResult<TOutput>;
      }

      current = res.value;
    }

    return ctx.ok(current as TOutput);
  }
}

/**
 * Composes two validators into a sequential pipeline.
 *
 * @typeParam A - Output of the first validator and input to the second.
 * @typeParam B - Output of the second validator.
 * @param v1 - First validator.
 * @param v2 - Second validator.
 * @returns A piped validator producing B.
 */
export function pipe<A, B>(v1: Validator<A, unknown>, v2: Validator<B, A>): Validator<B, unknown>;
/**
 * Composes three validators into a sequential pipeline.
 *
 * @typeParam A - Output of the first validator.
 * @typeParam B - Output of the second validator.
 * @typeParam C - Output of the third validator.
 * @param v1 - First validator.
 * @param v2 - Second validator.
 * @param v3 - Third validator.
 * @returns A piped validator producing C.
 */
export function pipe<A, B, C>(
  v1: Validator<A, unknown>,
  v2: Validator<B, A>,
  v3: Validator<C, B>,
): Validator<C, unknown>;
/**
 * Composes four validators into a sequential pipeline.
 *
 * @typeParam A - Output of the first validator.
 * @typeParam B - Output of the second validator.
 * @typeParam C - Output of the third validator.
 * @typeParam D - Output of the fourth validator.
 * @param v1 - First validator.
 * @param v2 - Second validator.
 * @param v3 - Third validator.
 * @param v4 - Fourth validator.
 * @returns A piped validator producing D.
 */
export function pipe<A, B, C, D>(
  v1: Validator<A, unknown>,
  v2: Validator<B, A>,
  v3: Validator<C, B>,
  v4: Validator<D, C>,
): Validator<D, unknown>;
/**
 * Composes an arbitrary number of validators into a sequential pipeline.
 *
 * @typeParam TOutput - Inferred output type of the pipeline.
 * @param validators - Array of validators to execute in sequence.
 * @returns A combined pipeline validator.
 */
export function pipe<TOutput = unknown>(...validators: Validator<unknown, unknown>[]): Validator<TOutput, unknown>;
export function pipe(...validators: Validator<unknown, unknown>[]): Validator<unknown, unknown> {
  if (validators.length === 0) {
    throw new Error("pipe requires at least one validator");
  }
  if (validators.length === 1 && validators[0] !== undefined) {
    return validators[0];
  }
  return new PipedValidator(validators);
}
