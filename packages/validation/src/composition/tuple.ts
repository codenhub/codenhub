import { runOf, toolsOf } from "../core/child";
import { accepter, waitsOf } from "../core/finish";
import { toValidator } from "../core/make";
import { isArray } from "../core/objects";
import { assertFunction, assertList, assertOrder, assertSize } from "../core/result";
import { refuse, report, type Run } from "../core/run";
import { split } from "../core/split";
import type {
  AnyValidator,
  AsyncRest,
  AsyncSchema,
  Composed,
  Infer,
  InferInput,
  MessageOptions,
  Rest,
} from "../core/types";
import { SIZE_WORDS } from "../core/words";
import { settle } from "./items";

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
 * @throws {TypeError} When `items` is not a list or is empty, an item or `rest` is not a validator of this copy of the package, `max`
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
): AsyncSchema<InferTuple<TItems, TRest>, InferTupleInput<TItems, TRest>>;
export function tuple(items: readonly AnyValidator[], ...args: unknown[]): AnyValidator {
  const [options, checks] = split<TupleOptions<AnyValidator | undefined>, unknown[]>(args, "rest max");
  const { rest, max, message } = options;
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

  const runs = fixed.map((item, index) => runOf(item, `items[${index}]`));
  const runRest = rest === undefined ? undefined : runOf(rest, "rest");
  const accept = accepter(checks, message);
  const tools = toolsOf([...runs, runRest], waitsOf(checks));
  // Made once, and given the input by `settle`, so validating a tuple makes no function.
  const runAt = (index: number, input: readonly unknown[]): unknown =>
    ((index < length ? runs[index] : runRest) as Run)(input[index]);
  const run: Run = (input) => {
    if (!isArray(input)) {
      return refuse("array", input, message);
    }
    const size = input.length;
    if (max !== undefined && size > max) {
      return report("too_big", { maximum: max, type: "array" }, message);
    }
    if (size < length || (rest === undefined && size > length)) {
      const isShort = size < length;
      return report(
        isShort ? "too_small" : "too_big",
        { [isShort ? "minimum" : "maximum"]: length, type: "array", ...(rest === undefined && { exact: true }) },
        message,
      );
    }
    // By index up to the length that was checked, never through the array's own iterator, as in `array`.
    return settle(size, runAt, message, tools, accept, undefined, undefined, input);
  };
  run.w = tools;
  return toValidator(
    run,
    { kind: "tuple", options, checks, items: Object.freeze(fixed), rest },
    SIZE_WORDS,
    rest === undefined ? fixed : [...fixed, rest],
  );
}
