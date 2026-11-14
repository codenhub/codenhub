import { runOf, toolsOf } from "../core/child";
import { accepter, waitsOf } from "../core/finish";
import { toValidator } from "../core/make";
import { sizeOfSet, valuesOf } from "../core/objects";
import { count, FAIL, MAX_ISSUES, refuse, report, type Run } from "../core/run";
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
import { SIZE_OPTIONS, assertSizeOptions, reportSize, type SizeOptions } from "./size";

/**
 * Creates a validator for `Set`s whose every value passes `item`.
 *
 * @remarks
 * A wrong size is reported at once, without validating the values. Otherwise every value is
 * validated, and each issue's path leads through the value's position in iteration order. The
 * output is a new `Set` of the validated values. When `item` changes values so that one becomes
 * equal to an earlier one, the later is reported as `invalid_value` with `{ unique: true }` at its
 * position, rather than dropped, up to the 1,000 issues a collection reports, so the output never holds fewer values than the size options allow.
 * It is synchronous when `item` is, and asynchronous otherwise.
 * A set stops once its items have reported 1,000 issues: the rest are not validated, and one more
 * issue, `too_big` with `{ maximum: 1000, type: "issues" }`, says that it stopped.
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
): Composed<TItem, Set<Infer<TItem>>, Set<InferInput<TItem>>>;
export function set<TItem extends AnyValidator>(
  item: TItem,
  ...rest: AsyncRest<Set<Infer<TItem>>, SizeOptions & MessageOptions>
): AsyncSchema<Set<Infer<TItem>>, Set<InferInput<TItem>>>;
export function set(item: AnyValidator, ...rest: unknown[]): AnyValidator {
  const runItem = runOf(item, "item");
  const [options, checks] = split<SizeOptions & MessageOptions, Set<unknown>>(rest, SIZE_OPTIONS);
  assertSizeOptions(options);
  const { message } = options;
  const accept = accepter(checks, message);
  const tools = toolsOf([runItem], waitsOf(checks));
  const run: Run = (input) => {
    const size = sizeOfSet(input);
    if (size === undefined) {
      return refuse("set", input, message);
    }
    if (reportSize(size, "set", options, message)) {
      return FAIL;
    }
    const items = valuesOf(input);
    return settle(
      items.length,
      (index) => runItem(items[index]),
      message,
      tools,
      accept,
      undefined,
      (values, from) => {
        const output = new Set<unknown>();
        // Only once every item passed. A value that validation made equal to an earlier one is reported,
        // not merged, so the output holds as many values as the size options were checked against.
        if (count() === from) {
          values.forEach((value, index) => {
            if (!output.has(value)) {
              output.add(value);
            } else if (count() - from <= MAX_ISSUES) {
              // One past the limit, which is how the list is known to be cut.
              report("invalid_value", { unique: true }, message, index);
            }
          });
        }
        return output;
      },
    );
  };
  run.w = tools;
  return toValidator(run, { kind: "set", options, checks, item }, SIZE_WORDS, [item]);
}
