import type { Maybe } from "../core/async";
import { tail } from "../core/checks";
import { below, call, composed } from "../core/nesting";
import { isArray } from "../core/objects";
import { assertFunction, typeIssue } from "../core/result";
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
import { assertSizeOptions, sizeIssues, type SizeOptions } from "./size";

/** Constraints for {@link array}. Every option is optional. Duplicates are rejected with the `unique()` check. */
export interface ArrayOptions extends SizeOptions, MessageOptions {}

/**
 * Creates a validator for arrays whose every item passes `item`.
 *
 * @remarks
 * A wrong size is reported at once, without validating the items, so a huge array is never
 * worked through only to be rejected. Otherwise every item is validated, and each issue's path
 * leads through the item's index. Checks, such as `unique()`, run on the validated items once every
 * item has passed. The output is a new array; the input is never modified. It is synchronous when
 * `item` is, and asynchronous otherwise.
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
 * @throws {TypeError} When `item` or a check is not a function, or `min`, `max` or `length` is not a number.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no size satisfies them together.
 */
export function array<TItem extends AnyValidator>(
  item: TItem,
  ...rest: Rest<Infer<TItem>[], ArrayOptions>
): Composed<TItem, Infer<TItem>[]>;
export function array<TItem extends AnyValidator>(
  item: TItem,
  ...rest: AsyncRest<Infer<TItem>[], ArrayOptions>
): AsyncValidator<Infer<TItem>[]>;
export function array(item: AnyValidator, ...rest: unknown[]): AnyValidator {
  assertFunction("item", item);
  const [options, reject, accept] = tail<ArrayOptions, unknown[]>(rest);
  assertSizeOptions(options);

  return composed((input, place): Maybe<ValidationResult<unknown>> => {
    if (!isArray(input)) {
      return reject([typeIssue("array", input)], place);
    }
    const { length } = input;
    const oversize = sizeIssues(length, "array", options);
    if (oversize.length > 0) {
      return reject(oversize, place);
    }
    return settle(
      // Read by index up to the length that was checked, never through the array's own iterator, which
      // the input can replace to yield other items or never stop.
      Array.from({ length }, (_, index) => call(item, input[index], below(place, index))),
      (values) => accept(values, place),
    );
  });
}
