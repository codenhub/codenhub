import type { Maybe } from "../core/async";
import { tail } from "../core/checks";
import { isArray } from "../core/objects";
import { assertFunction, assertList, issue, typeIssue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
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

/** Options for {@link tuple}. */
export interface TupleOptions<TRest extends AnyValidator | undefined = undefined> extends MessageOptions {
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
 * @param rest - The validator for extra positions, then checks.
 * @returns A validator that produces a tuple.
 * @throws {TypeError} When `items` is not a list or is empty, or an item or `rest` is not a function.
 */
export function tuple<
  const TItems extends readonly [AnyValidator, ...AnyValidator[]],
  TRest extends AnyValidator | undefined = undefined,
>(
  items: TItems,
  ...rest: Rest<InferTuple<TItems, TRest>, TupleOptions<TRest>>
): Composed<TItems[number] | Exclude<TRest, undefined>, InferTuple<TItems, TRest>>;
export function tuple<
  const TItems extends readonly [AnyValidator, ...AnyValidator[]],
  TRest extends AnyValidator | undefined = undefined,
>(
  items: TItems,
  ...rest: AsyncRest<InferTuple<TItems, TRest>, TupleOptions<TRest>>
): AsyncValidator<InferTuple<TItems, TRest>>;
export function tuple(items: readonly AnyValidator[], ...args: unknown[]): AnyValidator {
  const [options, reject, accept] = tail<TupleOptions<AnyValidator | undefined>, unknown[]>(args);
  const { rest } = options;
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

  return (input: unknown): Maybe<ValidationResult<unknown>> => {
    if (!isArray(input)) {
      return reject([typeIssue("array", input)]);
    }
    const size = input.length;
    if (size < length || (rest === undefined && size > length)) {
      const isShort = size < length;
      return reject([
        issue(isShort ? "too_small" : "too_big", {
          [isShort ? "minimum" : "maximum"]: length,
          type: "array",
          ...(rest === undefined && { exact: true }),
        }),
      ]);
    }
    return settle(
      // By index up to the length that was checked, never through the array's own iterator, as in `array`.
      Array.from({ length: size }, (_, index) =>
        ((index < length ? fixed[index] : rest) as AnyValidator)(input[index]),
      ),
      accept,
    );
  };
}
