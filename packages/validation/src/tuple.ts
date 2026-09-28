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
 * Infers the TypeScript tuple type produced by validating an ordered list of schemas with optional rest elements.
 *
 * @typeParam TItems - Positional tuple item validators.
 * @typeParam TRest - Element type of trailing rest items.
 */
export type InferTupleWithRest<TItems extends readonly Validator<unknown>[], TRest = never> = [TRest] extends [never]
  ? InferTuple<TItems>
  : [...InferTuple<TItems>, ...TRest[]];

/**
 * Schema validator for fixed-length heterogeneous tuples and tuples with trailing rest elements.
 *
 * Enforces that input is an array of the required length, with each element
 * satisfying its corresponding index schema or trailing rest schema.
 *
 * @typeParam TItems - Array of item validators corresponding to tuple positions.
 * @typeParam TRest - Trailing rest element type if `.rest()` was attached.
 */
export class TupleValidator<TItems extends readonly Validator<unknown>[], TRest = never> extends BaseValidator<
  InferTupleWithRest<TItems, TRest>,
  unknown
> {
  /**
   * Constructs a TupleValidator with an array of positional item schemas and an optional rest validator.
   *
   * @param _items - Positional validators defining the tuple structure.
   * @param _rest - Optional validator applied to all elements beyond the positional items.
   */
  constructor(
    protected readonly _items: TItems,
    protected readonly _rest?: Validator<TRest>,
  ) {
    super();
  }

  /**
   * Returns the positional tuple item schemas.
   */
  get items(): TItems {
    return this._items;
  }

  /**
   * Returns the trailing rest validator schema if one was configured.
   */
  get restElement(): Validator<TRest> | undefined {
    return this._rest;
  }

  /**
   * Returns a new TupleValidator accepting variable trailing elements conforming to the given validator.
   *
   * @typeParam TRestNew - Type of trailing rest elements.
   * @param restValidator - Validator applied to every element after the fixed tuple positions.
   * @returns A new immutable TupleValidator supporting trailing rest elements.
   */
  rest<TRestNew>(restValidator: Validator<TRestNew>): TupleValidator<TItems, TRestNew> {
    return new TupleValidator(this._items, restValidator);
  }

  protected override isAsync(): boolean {
    const itemsAsync = this._items.some(
      (v) => v instanceof BaseValidator && (v as unknown as { isAsync(): boolean }).isAsync(),
    );
    const restAsync =
      this._rest instanceof BaseValidator && (this._rest as unknown as { isAsync(): boolean }).isAsync();
    return itemsAsync || restAsync;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<InferTupleWithRest<TItems, TRest>> {
    if (!Array.isArray(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected array, got ${describeReceived(input)}`,
        expected: "tuple",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    if (this._rest === undefined) {
      if (input.length !== this._items.length) {
        const issue: ValidationIssue = {
          code: "invalid_value",
          message: `Expected tuple of length ${this._items.length}, got ${input.length}`,
          path: ctx.path,
          expected: `${this._items.length} items`,
          received: `${input.length} items`,
          input: ctx.options.includeInput ? input : undefined,
        };
        ctx.addIssue(issue);
        return ctx.fail(issue);
      }
    } else {
      if (input.length < this._items.length) {
        const issue: ValidationIssue = {
          code: "too_small",
          message: `Expected at least ${this._items.length} items, got ${input.length}`,
          path: ctx.path,
          expected: `at least ${this._items.length} items`,
          received: `${input.length} items`,
          input: ctx.options.includeInput ? input : undefined,
        };
        ctx.addIssue(issue);
        return ctx.fail(issue);
      }
    }

    const localIssues: ValidationIssue[] = [];
    const output: unknown[] = [];

    for (let i = 0; i < input.length; i++) {
      const childValidator: Validator<unknown> =
        i < this._items.length ? (this._items[i] as Validator<unknown>) : (this._rest as Validator<unknown>);
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

    return ctx.ok(output as InferTupleWithRest<TItems, TRest>);
  }

  protected override async _validateAsync(
    input: unknown,
    ctx: ValidationContext,
  ): Promise<ValidationResult<InferTupleWithRest<TItems, TRest>>> {
    if (!Array.isArray(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected array, got ${describeReceived(input)}`,
        expected: "tuple",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
      });
    }

    if (this._rest === undefined) {
      if (input.length !== this._items.length) {
        const issue: ValidationIssue = {
          code: "invalid_value",
          message: `Expected tuple of length ${this._items.length}, got ${input.length}`,
          path: ctx.path,
          expected: `${this._items.length} items`,
          received: `${input.length} items`,
          input: ctx.options.includeInput ? input : undefined,
        };
        ctx.addIssue(issue);
        return ctx.fail(issue);
      }
    } else {
      if (input.length < this._items.length) {
        const issue: ValidationIssue = {
          code: "too_small",
          message: `Expected at least ${this._items.length} items, got ${input.length}`,
          path: ctx.path,
          expected: `at least ${this._items.length} items`,
          received: `${input.length} items`,
          input: ctx.options.includeInput ? input : undefined,
        };
        ctx.addIssue(issue);
        return ctx.fail(issue);
      }
    }

    const localIssues: ValidationIssue[] = [];
    const output: unknown[] = [];

    /* oxlint-disable no-await-in-loop */
    for (let i = 0; i < input.length; i++) {
      const childValidator: Validator<unknown> =
        i < this._items.length ? (this._items[i] as Validator<unknown>) : (this._rest as Validator<unknown>);
      const childPath = [...ctx.path, i];
      const res = await childValidator.validateAsync(input[i], {
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

    return ctx.ok(output as InferTupleWithRest<TItems, TRest>);
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
