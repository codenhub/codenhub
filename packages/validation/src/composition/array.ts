import type { Maybe } from "../core/async";
import { failWith, invalidType, pass, repeatedItem } from "../core/result";
import type { AnyValidator, Composed, Infer, ValidationResult } from "../core/types";
import { settle } from "./settle";
import { assertSizeOptions, sizeIssues, type SizeOptions } from "./size";

/**
 * Constraints for {@link array}. Every option is optional.
 *
 * @typeParam TItem - The type of an item after validation, which `unique` receives.
 */
export interface ArrayOptions<TItem = unknown> extends SizeOptions {
  /**
   * Rejects duplicates, reporting each repeat at its own index. `true` compares the validated items
   * themselves; a function compares the value it returns for each item, so `(user) => user.id`
   * makes ids unique. Comparison is SameValueZero, as for a `Set`.
   */
  unique?: boolean | ((item: TItem) => unknown);
}

/**
 * Creates a validator for arrays whose every item passes `element`.
 *
 * @remarks
 * A wrong size is reported at once, without validating the items, so a huge array is never
 * worked through only to be rejected. Otherwise every item is validated, and each issue's path
 * leads through the item's index. `unique` is checked on the validated items, after the others
 * pass. The output is a new array; the input is never modified. It is synchronous when `element` is,
 * and asynchronous otherwise.
 *
 * @example
 * ```ts
 * const tags = array(string({ trim: true, min: 1 }), { max: 5, unique: true });
 * tags(["a", "b"]); // { ok: true, value: ["a", "b"] }
 * tags(["a", "a"]); // { ok: false, ... }, code "invalid_value" at path [1]
 * ```
 *
 * @typeParam TElement - The validator for each item.
 * @param element - Validator applied to every item.
 * @param options - Size limits and uniqueness.
 * @returns A validator that produces an array of what `element` produces.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no size satisfies them together.
 */
export function array<TElement extends AnyValidator>(
  element: TElement,
  options: ArrayOptions<Infer<TElement>> = {},
): Composed<TElement, Infer<TElement>[]> {
  assertSizeOptions(options);
  const { unique } = options;
  const keyOf = typeof unique === "function" ? (unique as (item: unknown) => unknown) : (item: unknown) => item;

  const validate = (input: unknown): Maybe<ValidationResult<unknown>> => {
    if (!Array.isArray(input)) {
      return invalidType("array", input);
    }
    const oversize = sizeIssues(input.length, "array", options);
    if (oversize.length > 0) {
      return failWith(oversize);
    }
    return settle(
      Array.from(input, (item) => element(item)),
      (items) => {
        if (unique === undefined || unique === false) {
          return pass(items);
        }
        const seen = new Set<unknown>();
        const repeats = items.flatMap((item, index) => {
          const key = keyOf(item);
          const isRepeat = seen.has(key);
          seen.add(key);
          return isRepeat ? [repeatedItem(index)] : [];
        });
        return repeats.length > 0 ? failWith(repeats) : pass(items);
      },
    );
  };
  return validate as unknown as Composed<TElement, Infer<TElement>[]>;
}
