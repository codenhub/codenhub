import type { Maybe } from "../core/async";
import { failWith, invalidType, pass, toIssue } from "../core/result";
import type { AnyValidator, Composed, Infer, ValidationResult } from "../core/types";
import { settle } from "./settle";

type InferItems<TItems extends readonly AnyValidator[]> = { -readonly [K in keyof TItems]: Infer<TItems[K]> };

/**
 * The array type a tuple produces: the fixed items in order, then any number of `rest` values.
 *
 * @typeParam TItems - The validators of the fixed positions.
 * @typeParam TRest - The validator of the remaining positions, or `undefined` for none.
 */
export type InferTuple<
  TItems extends readonly AnyValidator[],
  TRest extends AnyValidator | undefined = undefined,
> = TRest extends AnyValidator ? [...InferItems<TItems>, ...Infer<TRest>[]] : InferItems<TItems>;

/** Options for {@link tuple}. */
export interface TupleOptions<TRest extends AnyValidator | undefined = undefined> {
  /** Validator for every position after the fixed ones. Without it the array must be exactly as long as the tuple. */
  rest?: TRest;
}

/**
 * Creates a validator for arrays of fixed length whose items each have their own validator.
 *
 * @remarks
 * A wrong length is reported at once, without validating the items. With `rest`, the array may be
 * longer, and every extra item must pass it. Each issue's path leads through the item's index.
 *
 * @example
 * ```ts
 * const point = tuple([number(), number()]);
 * point([1, 2]); // { ok: true, value: [1, 2] }
 * point([1]); // { ok: false, ... }, code "too_small"
 *
 * const args = tuple([string()], { rest: number() });
 * args(["sum", 1, 2, 3]); // { ok: true, ... }
 * ```
 *
 * @typeParam TItems - The validators of the fixed positions, at least one.
 * @typeParam TRest - The validator of the remaining positions.
 * @param items - One validator per position.
 * @param options - The validator for extra positions.
 * @returns A validator that produces a tuple.
 */
export function tuple<
  const TItems extends readonly [AnyValidator, ...AnyValidator[]],
  TRest extends AnyValidator | undefined = undefined,
>(
  items: TItems,
  options: TupleOptions<TRest> = {},
): Composed<TItems[number] | Exclude<TRest, undefined>, InferTuple<TItems, TRest>> {
  const { rest } = options;
  const { length } = items;

  const validate = (input: unknown): Maybe<ValidationResult<unknown>> => {
    if (!Array.isArray(input)) {
      return invalidType("array", input);
    }
    if (input.length < length || (rest === undefined && input.length > length)) {
      const isShort = input.length < length;
      return failWith([
        toIssue({
          code: isShort ? "too_small" : "too_big",
          params: {
            [isShort ? "minimum" : "maximum"]: length,
            type: "array",
            ...(rest === undefined && { exact: true }),
          },
        }),
      ]);
    }
    return settle(
      Array.from(input, (item, index) => ((index < length ? items[index] : rest) as AnyValidator)(item)),
      pass,
    );
  };
  return validate as unknown as Composed<TItems[number] | Exclude<TRest, undefined>, InferTuple<TItems, TRest>>;
}
