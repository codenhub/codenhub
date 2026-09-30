import { word } from "../core/checks";
import { repeatedItem } from "../core/result";
import type { Check, Message, ValidationIssue } from "../core/types";

/**
 * Requires the items of an array to be distinct, reporting each repeat at its own index with
 * `invalid_value` and `params` `{ unique: true }`.
 *
 * @remarks
 * Without `by` it compares the validated items themselves; with it, the value `by` returns for each, so
 * `unique((user) => user.id)` makes ids unique. Comparison is SameValueZero, as for a `Set`.
 *
 * @example
 * ```ts
 * array(string(), { max: 10 }, unique());
 * array(object({ id: number(), name: string() }), unique((user) => user.id, "Ids must be unique"));
 * ```
 *
 * @typeParam T - The type of an item.
 * @param by - What to compare for each item. The item itself when omitted.
 * @param message - Wording for each issue.
 * @returns A check of arrays.
 */
export function unique<T>(by?: (item: T) => unknown, message?: Message): Check<readonly T[]> {
  const keyOf = by ?? ((item: T): unknown => item);
  return (items) => {
    const seen = new Set<unknown>();
    const repeats: ValidationIssue[] = [];
    items.forEach((item, index) => {
      const key = keyOf(item);
      if (seen.has(key)) {
        repeats.push(repeatedItem(index));
      }
      seen.add(key);
    });
    return repeats.length > 0 ? word(repeats, message) : undefined;
  };
}
