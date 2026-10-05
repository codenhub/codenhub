import { assertMessage, word } from "../core/checks";
import { cap, MAX_ISSUES } from "../core/limit";
import { assertFunction, repeatedItem } from "../core/result";
import type { Check, Message, ValidationIssue } from "../core/types";
import type { LiteralValue } from "../primitives/literal";

/**
 * Requires the items of an array to be distinct, reporting each repeat at its own index with
 * `invalid_value` and `params` `{ unique: true }`, up to the 1,000 issues a collection reports.
 *
 * @remarks
 * Without `by` it compares the validated items themselves; with it, the value `by` returns for each, so
 * `unique((user) => user.id)` makes ids unique. Comparison is SameValueZero, as for a `Set`, so two
 * objects are equal only when they are the same object. Every object or list a composer such as `object`
 * or `array` produces is new, and two `Date`s of one moment are two objects, so `unique()` without `by`
 * would find a repeat among them only where a validator passed the same object through twice: the types
 * accept it only for an array of primitives, and an array of objects, lists or dates needs `by`, such as
 * `unique((user) => user.id)` or `unique((day) => day.getTime())`.
 *
 * @example
 * ```ts
 * array(string(), { max: 10 }, unique());
 * array(object({ id: number(), name: string() }), unique((user) => user.id, "Ids must be unique"));
 * ```
 *
 * @typeParam T - The type of an item, a primitive when `by` is omitted.
 * @param by - What to compare for each item. The item itself when omitted.
 * @param message - Wording for each issue.
 * @returns A check of arrays.
 * @throws {TypeError} When `by` is given and is not a function, such as a message in its place: a
 * message alone is `unique(undefined, message)`, or `message` is neither text nor a function.
 */
export function unique<T extends LiteralValue>(by?: undefined, message?: Message): Check<readonly T[]>;
export function unique<T>(by: (item: T) => unknown, message?: Message): Check<readonly T[]>;
export function unique<T>(by?: (item: T) => unknown, message?: Message): Check<readonly T[]> {
  if (by !== undefined) {
    assertFunction("by", by);
  }
  assertMessage(message);
  const keyOf = by ?? ((item: T): unknown => item);
  return (items) => {
    const seen = new Set<unknown>();
    const repeats: ValidationIssue[] = [];
    items.forEach((item, index) => {
      const key = keyOf(item);
      // One past the limit of a collection, which is how the list is known to be cut.
      if (seen.has(key) && repeats.length <= MAX_ISSUES) {
        repeats.push(repeatedItem(index));
      }
      seen.add(key);
    });
    return repeats.length > 0 ? word(cap(repeats, undefined, message), message) : undefined;
  };
}
