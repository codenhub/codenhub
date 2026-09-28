import { BaseValidator, type ValidationContext, type Validator } from "./core";
import { describeReceived, type ValidationIssue, type ValidationResult } from "./result";

/**
 * Infers the TypeScript tuple type produced by validating an ordered list of schemas.
 *
 * @typeParam T - Tuple or array of item validators.
 */
export type InferTuple<T extends readonly Validator<unknown>[]> = {
  [K in keyof T]: T[K] extends Validator<infer O, unknown> ? O : never;
};

/**
 * Schema validator for fixed-length heterogeneous tuples.
 *
 * Enforces that input is an array of the exact specified length, with each element
 * satisfying its corresponding index schema.
 *
 * @typeParam TItems - Array of item validators corresponding to tuple positions.
 */
export class TupleValidator<TItems extends readonly Validator<unknown>[]> extends BaseValidator<
  InferTuple<TItems>,
  unknown
> {
  /**
   * Constructs a TupleValidator with an array of positional item schemas.
   *
   * @param _items - Positional validators defining the tuple structure.
   */
  constructor(protected readonly _items: TItems) {
    super();
  }

  /**
   * Returns the tuple item schemas.
   */
  get items(): TItems {
    return this._items;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<InferTuple<TItems>> {
    if (!Array.isArray(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected array, got ${describeReceived(input)}`,
        expected: "tuple",
        received: describeReceived(input),
        input,
      });
    }

    if (input.length !== this._items.length) {
      const issue: ValidationIssue = {
        code: "invalid_value",
        message: `Expected tuple of length ${this._items.length}, got ${input.length}`,
        path: ctx.path,
        expected: `${this._items.length} items`,
        received: `${input.length} items`,
        input,
      };
      ctx.addIssue(issue);
      return ctx.fail(issue);
    }

    const localIssues: ValidationIssue[] = [];
    const output: unknown[] = [];

    for (let i = 0; i < this._items.length; i++) {
      const childValidator = this._items[i];
      const childPath = [...ctx.path, i];
      const res = childValidator.validate(input[i], {
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

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Tuple validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(output as InferTuple<TItems>);
  }
}

/**
 * Creates a schema validator for fixed-length positional tuples.
 *
 * @typeParam TItems - Array of positional item validators.
 * @param items - Array of validators for each position in the tuple.
 * @returns A new TupleValidator instance.
 */
export function tuple<TItems extends readonly [Validator<unknown>, ...Validator<unknown>[]]>(
  items: TItems,
): TupleValidator<TItems> {
  return new TupleValidator(items);
}
