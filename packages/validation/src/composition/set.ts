import type { Maybe } from "../core/async";
import { tail } from "../core/checks";
import { below, call, composed } from "../core/nesting";
import { sizeOfSet, valuesOf } from "../core/objects";
import { assertFunction, repeatedItem, typeIssue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  MessageOptions,
  Rest,
  ValidationIssue,
  ValidationResult,
} from "../core/types";
import { settle } from "./settle";
import { assertSizeOptions, sizeIssues, type SizeOptions } from "./size";

/**
 * Creates a validator for `Set`s whose every value passes `item`.
 *
 * @remarks
 * A wrong size is reported at once, without validating the values. Otherwise every value is
 * validated, and each issue's path leads through the value's position in iteration order. The
 * output is a new `Set` of the validated values. When `item` changes values so that one becomes
 * equal to an earlier one, the later is reported as `invalid_value` with `{ unique: true }` at its
 * position, rather than dropped, so the output never holds fewer values than the size options allow.
 * It is synchronous when `item` is, and asynchronous otherwise.
 *
 * @example
 * ```ts
 * const ids = set(number({ int: true }), { min: 1 });
 * ids(new Set([1, 2])); // { ok: true, value: Set { 1, 2 } }
 * ids(new Set()); // { ok: false, ... }, code "too_small"
 * ```
 *
 * @typeParam TItem - The validator for each value.
 * @param item - Validator applied to every value.
 * @param rest - Size limits, then checks.
 * @returns A validator that produces a `Set` of what `item` produces.
 * @throws {TypeError} When `item` or a check is not a function, or `min`, `max` or `length` is not a number.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no size satisfies them together.
 */
export function set<TItem extends AnyValidator>(
  item: TItem,
  ...rest: Rest<Set<Infer<TItem>>, SizeOptions & MessageOptions>
): Composed<TItem, Set<Infer<TItem>>>;
export function set<TItem extends AnyValidator>(
  item: TItem,
  ...rest: AsyncRest<Set<Infer<TItem>>, SizeOptions & MessageOptions>
): AsyncValidator<Set<Infer<TItem>>>;
export function set(item: AnyValidator, ...rest: unknown[]): AnyValidator {
  assertFunction("item", item);
  const [options, reject, accept] = tail<SizeOptions & MessageOptions, Set<unknown>>(rest);
  assertSizeOptions(options);
  return composed((input, place): Maybe<ValidationResult<unknown>> => {
    const size = sizeOfSet(input);
    if (size === undefined) {
      return reject([typeIssue("set", input)], place);
    }
    const oversize = sizeIssues(size, "set", options);
    if (oversize.length > 0) {
      return reject(oversize, place);
    }
    return settle(
      valuesOf(input).map((value, index) => call(item, value, below(place, index))),
      (values) => {
        // A value that validation made equal to an earlier one is reported, not merged, so the output
        // holds as many values as the size options were checked against.
        const output = new Set<unknown>();
        const repeats: ValidationIssue[] = [];
        values.forEach((value, index) => {
          if (output.has(value)) {
            repeats.push(repeatedItem(index));
          } else {
            output.add(value);
          }
        });
        return repeats.length > 0 ? reject(repeats, place) : accept(output, place);
      },
    );
  });
}
