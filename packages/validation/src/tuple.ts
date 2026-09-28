import { chain, collect, type MaybePromise } from "./async";
import { execute, Validator, type AnyValidator, type Infer } from "./core";
import { childContext, fail, failWith, invalidType, pass, type Outcome, type ParseContext } from "./internal";
import { type Message, type ValidationIssue } from "./issue";

/**
 * Infers the tuple type a tuple validator produces.
 *
 * @typeParam TItems - Validators of the fixed positions.
 * @typeParam TRest - Type of the items after the fixed positions, or `never` when there are none.
 */
export type InferTuple<TItems extends readonly AnyValidator[], TRest = never> = [TRest] extends [never]
  ? { -readonly [K in keyof TItems]: Infer<TItems[K]> }
  : [...{ -readonly [K in keyof TItems]: Infer<TItems[K]> }, ...TRest[]];

/**
 * Validator for arrays with a fixed sequence of typed positions, created by {@link tuple}.
 *
 * @typeParam TItems - Validators of the fixed positions.
 * @typeParam TRest - Type of the items after the fixed positions, or `never` when there are none.
 */
export class TupleValidator<TItems extends readonly AnyValidator[], TRest = never> extends Validator<
  InferTuple<TItems, TRest>
> {
  /**
   * Creates a tuple validator.
   *
   * @param items - Validator of each position.
   * @param restValidator - Validator of any items after the listed positions. Extra items are rejected when omitted.
   * @param message - Message when the input is not an array.
   */
  constructor(
    readonly items: TItems,
    readonly restValidator?: Validator<TRest>,
    private readonly message?: Message,
  ) {
    super();
  }

  /**
   * Accepts any number of extra items after the listed positions, each satisfying a validator.
   * Rules added with `refine` or `check` are not kept, so call it before them.
   *
   * @typeParam TNext - Type of the extra items.
   * @param validator - Validator every extra item must satisfy.
   * @returns A validator that accepts the extra items.
   */
  rest<TNext>(validator: Validator<TNext>): TupleValidator<TItems, TNext> {
    return new TupleValidator(this.items, validator, this.message);
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<InferTuple<TItems, TRest>>> {
    if (!Array.isArray(input)) {
      return invalidType(ctx, "array", input, this.message);
    }

    const { length } = this.items;
    const hasRest = this.restValidator !== undefined;
    if (input.length < length || (!hasRest && input.length > length)) {
      const isShort = input.length < length;
      return fail(ctx, {
        code: isShort ? "too_small" : "too_big",
        message: `Expected ${hasRest ? "at least " : ""}${length} ${length === 1 ? "item" : "items"}, received ${input.length}`,
        params: { [isShort ? "minimum" : "maximum"]: length, type: "array" },
        input,
      });
    }

    return chain(
      collect(
        input.length,
        (index) => {
          const validator = index < length ? this.items[index] : this.restValidator;
          return execute(validator as AnyValidator, input[index], childContext(ctx, index));
        },
        ctx.options.abortEarly === true ? (outcome) => !outcome.ok : undefined,
      ),
      (outcomes) => {
        const issues: ValidationIssue[] = [];
        const output: unknown[] = [];
        for (const outcome of outcomes) {
          if (outcome.ok) {
            output.push(outcome.value);
          } else {
            issues.push(...outcome.issues);
          }
        }
        return issues.length > 0 ? failWith(issues) : pass(output as InferTuple<TItems, TRest>);
      },
    );
  }
}

/**
 * Creates a validator for arrays with a fixed sequence of typed positions.
 *
 * @example
 * ```ts
 * const point = val.tuple([val.number(), val.number()]);
 * ```
 *
 * @typeParam TItems - Validators of the fixed positions.
 * @param items - Validator of each position.
 * @param message - Message when the input is not an array.
 * @returns A tuple validator.
 */
export function tuple<const TItems extends readonly [AnyValidator, ...AnyValidator[]]>(
  items: TItems,
  message?: Message,
): TupleValidator<TItems> {
  return new TupleValidator(items, undefined, message);
}
