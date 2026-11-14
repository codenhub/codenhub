import { runOf, toolsOf } from "../core/child";
import { accepter, waitsOf } from "../core/finish";
import { toValidator } from "../core/make";
import { isArray } from "../core/objects";
import { FAIL, refuse, type Run } from "../core/run";
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
import { assertSizeOptions, reportSize, type SizeOptions } from "./size";

/** Constraints for {@link array}. Every option is optional. Duplicates are rejected with the `unique()` check. */
export interface ArrayOptions extends SizeOptions, MessageOptions {}

/**
 * Creates a validator for arrays whose every item passes `item`.
 *
 * @remarks
 * A wrong size is reported at once, without validating the items, so a huge array is never
 * worked through only to be rejected. Otherwise the items are validated, a later one even when an earlier one failed, and each issue's path
 * leads through the item's index. Checks, such as `unique()`, run on the validated items once every
 * item has passed. The output is a new array; the input is never modified. It is synchronous when
 * `item` is, and asynchronous otherwise.
 * An array stops once its items have reported 1,000 issues: the rest are not validated, and one more
 * issue, `too_big` with `{ maximum: 1000, type: "issues" }`, says that it stopped.
 *
 * @example
 * ```ts
 * const tags = array(string({ trim: true, min: 1 }), { max: 5 }, unique());
 * tags(["a", "b"]); // { ok: true, value: ["a", "b"] }
 * tags(["a", "a"]); // { ok: false, ... }, code "invalid_value" at path [1]
 * ```
 *
 * @typeParam TItem - The validator for each item.
 * @param item - Validator applied to every item.
 * @param rest - Size limits, then checks.
 * @returns A validator that produces an array of what `item` produces.
 * @throws {TypeError} When `item` is not a validator of this copy of the package, a check was not made by `check`, `checkFields` or a built-in check, or `min`, `max` or `length` is not a number.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no size satisfies them together.
 */
export function array<TItem extends AnyValidator>(
  item: TItem,
  ...rest: Rest<Infer<TItem>[], ArrayOptions>
): Composed<TItem, Infer<TItem>[], InferInput<TItem>[]>;
export function array<TItem extends AnyValidator>(
  item: TItem,
  ...rest: AsyncRest<Infer<TItem>[], ArrayOptions>
): AsyncSchema<Infer<TItem>[], InferInput<TItem>[]>;
export function array(item: AnyValidator, ...rest: unknown[]): AnyValidator {
  const runItem = runOf(item, "item");
  const [options, checks] = split<ArrayOptions, unknown[]>(rest, "min max length");
  assertSizeOptions(options);
  const { min, max, length: exact, message } = options;
  const isSized = min !== undefined || max !== undefined || exact !== undefined;
  const accept = accepter(checks, message);
  const tools = toolsOf([runItem], waitsOf(checks));
  // Made once, and given the input by `settle`, so validating a list makes no function.
  const runAt = (index: number, input: readonly unknown[]): unknown => runItem(input[index]);
  const run: Run = (input) => {
    if (!isArray(input)) {
      return refuse("array", input, message);
    }
    const { length } = input;
    // The size is checked before any item, so `max` bounds the work as well as the value.
    if (isSized && reportSize(length, "array", options, message)) {
      return FAIL;
    }
    // Read by index up to the length that was checked, never through the array's own iterator, which
    // the input can replace to yield other items or never stop.
    return settle(length, runAt, message, tools, accept, undefined, undefined, input);
  };
  run.w = tools;
  return toValidator(run, { kind: "array", options, checks, item }, SIZE_WORDS, [item]);
}
