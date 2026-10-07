import type { Maybe } from "../core/async";
import { tail } from "../core/checks";
import { described } from "../core/describe";
import { childOf, composed, type Child } from "../core/nesting";
import { isArray } from "../core/objects";
import { assertFunction, assertList, assertOrder, assertSize, issue, typeIssue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  InferInput,
  MessageOptions,
  Rest,
  ValidationResult,
} from "../core/types";
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

type InferItemInputs<TItems extends readonly AnyValidator[]> = {
  -readonly [K in keyof TItems]: InferInput<TItems[K]>;
};

/**
 * The array type that can pass a tuple: what each fixed item accepts, then any number of what `rest` accepts.
 *
 * @typeParam TItems - The validators of the fixed positions.
 * @typeParam TRest - The validator of the remaining positions, or `undefined` for none.
 */
export type InferTupleInput<
  TItems extends readonly AnyValidator[],
  TRest extends AnyValidator | undefined = undefined,
> = TRest extends AnyValidator ? [...InferItemInputs<TItems>, ...InferInput<TRest>[]] : InferItemInputs<TItems>;

/** Options for {@link tuple}. */
export interface TupleOptions<TRest extends AnyValidator | undefined = undefined> extends MessageOptions {
  /** Validator for every position after the fixed ones. Without it the array must be exactly as long as the tuple. */
  rest?: TRest | undefined;
  /**
   * The most items the array may hold, the fixed ones included, a non-negative integer no smaller than
   * their number. Only with `rest`, since without it the length is fixed.
   */
  max?: (TRest extends AnyValidator ? number : never) | undefined;
}

/**
 * Creates a validator for arrays of fixed length whose items each have their own validator.
 *
 * @remarks
 * A wrong length is reported at once, without validating the items. With `rest`, the array may be
 * longer, and every extra item must pass it; `max` caps how long, the fixed items included, and a longer
 * array fails with `too_big` and `{ maximum, type: "array" }`. Each issue's path leads through the item's
 * index.
 * A tuple stops once its items have reported 1,000 issues: the rest are not validated, and one more
 * issue, `too_big` with `{ maximum: 1000, type: "issues" }`, says that it stopped.
 *
 * @example
 * ```ts
 * const point = tuple([number(), number()]);
 * point([1, 2]); // { ok: true, value: [1, 2] }
 * point([1]); // { ok: false, ... }, code "too_small"
 *
 * const args = tuple([string()], { rest: number(), max: 10 });
 * args(["sum", 1, 2, 3]); // { ok: true, ... }
 * ```
 *
 * @typeParam TItems - The validators of the fixed positions, at least one.
 * @typeParam TRest - The validator of the remaining positions.
 * @param items - One validator per position.
 * @param rest - The validator for extra positions and the most items in all, then checks.
 * @returns A validator that produces a tuple.
 * @throws {TypeError} When `items` is not a list or is empty, an item or `rest` is not a function, `max`
 * is not a number, or `max` is given without `rest`.
 * @throws {RangeError} When `max` is not a non-negative integer, or is less than the number of fixed items.
 */
export function tuple<
  const TItems extends readonly [AnyValidator, ...AnyValidator[]],
  TRest extends AnyValidator | undefined = undefined,
>(
  items: TItems,
  ...rest: Rest<InferTuple<TItems, TRest>, TupleOptions<TRest>>
): Composed<TItems[number] | Exclude<TRest, undefined>, InferTuple<TItems, TRest>, InferTupleInput<TItems, TRest>>;
export function tuple<
  const TItems extends readonly [AnyValidator, ...AnyValidator[]],
  TRest extends AnyValidator | undefined = undefined,
>(
  items: TItems,
  ...rest: AsyncRest<InferTuple<TItems, TRest>, TupleOptions<TRest>>
): AsyncValidator<InferTuple<TItems, TRest>, InferTupleInput<TItems, TRest>>;
export function tuple(items: readonly AnyValidator[], ...args: unknown[]): AnyValidator {
  const [options, reject, accept, checks] = tail<TupleOptions<AnyValidator | undefined>, unknown[]>(args, "rest max");
  const { rest, max } = options;
  assertList("items", items);
  // Copied, so changing the list after the validator is made changes nothing.
  const fixed = [...items];
  if (fixed.length === 0) {
    // The types forbid it: with `rest` it is an `array`, and without it a list that must be empty.
    throw new TypeError("tuple() needs at least one item");
  }
  fixed.forEach((item, index) => assertFunction(`items[${index}]`, item));
  if (rest !== undefined) {
    assertFunction("rest", rest);
  }
  const { length } = fixed;
  if (max !== undefined) {
    if (rest === undefined) {
      throw new TypeError("max needs rest, since the length is otherwise fixed");
    }
    assertSize("max", max);
    assertOrder("the fixed items", length, "max", max);
  }

  const children = fixed.map(childOf);
  const restChild = rest === undefined ? undefined : childOf(rest);

  return described(
    composed((input, place): Maybe<ValidationResult<unknown>> => {
      if (!isArray(input)) {
        return reject([typeIssue("array", input)], place);
      }
      const size = input.length;
      if (max !== undefined && size > max) {
        return reject([issue("too_big", { maximum: max, type: "array" })], place);
      }
      if (size < length || (rest === undefined && size > length)) {
        const isShort = size < length;
        return reject(
          [
            issue(isShort ? "too_small" : "too_big", {
              [isShort ? "minimum" : "maximum"]: length,
              type: "array",
              ...(rest === undefined && { exact: true }),
            }),
          ],
          place,
        );
      }
      return settle(
        size,
        // By index up to the length that was checked, never through the array's own iterator, as in `array`.
        (index) => ((index < length ? children[index] : restChild) as Child)(input[index], place, index),
        place,
        options.message,
        (values) => accept(values, place),
      );
    }),
    { kind: "tuple", options, checks, items: Object.freeze(fixed), rest },
  );
}
