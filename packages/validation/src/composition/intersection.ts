import { chain, collect, type Maybe } from "../core/async";
import { isPlainObject, setOwn, timeOf } from "../core/objects";
import { assertFunction, failWith, pass, toIssue } from "../core/result";
import type {
  AnyValidator,
  Composed,
  Infer,
  ValidationIssue,
  ValidationPathSegment,
  ValidationResult,
} from "../core/types";

/**
 * Combines two validated values into one. The same value on both sides is kept, which is what a key
 * both sides passed through unchecked holds, so a cycle in the input is never followed, and so are two
 * dates holding the same moment. Plain objects are merged key by key and arrays of the same length item
 * by item, recursively. Anything else cannot be both values at once, so it is reported in `conflicts`
 * at its path, and the right value stands in only so the walk can go on.
 */
function merge(
  left: unknown,
  right: unknown,
  path: readonly ValidationPathSegment[],
  conflicts: ValidationIssue[],
): unknown {
  const time = timeOf(left);
  if (Object.is(left, right) || (time !== undefined && time === timeOf(right))) {
    return right;
  }
  if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
    return Array.from(left, (item: unknown, index) => merge(item, right[index], [...path, index], conflicts));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const merged: Record<string, unknown> = {};
    for (const source of [left, right]) {
      for (const [key, value] of Object.entries(source)) {
        // setOwn defines an own data property, so no key can write to the prototype.
        setOwn(merged, key, Object.hasOwn(merged, key) ? merge(merged[key], value, [...path, key], conflicts) : value);
      }
    }
    return merged;
  }
  conflicts.push(toIssue({ code: "invalid_intersection", path }));
  return right;
}

/**
 * Creates a validator that accepts a value only when it passes both validators, and produces the two
 * results merged.
 *
 * @remarks
 * Both validators receive the same input and both run, so the issues of each are reported together.
 * The outputs are merged: plain objects key by key and arrays of the same length item by item,
 * recursively, while any other pair must be the same value, or two dates holding the same moment. Where
 * the outputs differ otherwise, such as `"  ab "` trimmed on one side and uppercased on the other, no
 * value satisfies both, so each such place fails with `invalid_intersection` at its path, rather than
 * one side silently winning. Two `object`s with `unknownKeys: "strict"` never pass together, since each rejects the
 * keys only the other lists; spread their shapes into one strict object instead. It is synchronous
 * when both validators are, and asynchronous otherwise.
 *
 * @example
 * ```ts
 * const named = object({ name: string() });
 * const aged = object({ age: number() });
 * intersection(named, aged)({ name: "Ada", age: 36 }); // { ok: true, value: { name: "Ada", age: 36 } }
 * ```
 *
 * @typeParam TLeft - The first validator.
 * @typeParam TRight - The second validator.
 * @param left - The first validator.
 * @param right - The second validator.
 * @returns A validator that produces the merged outputs, typed as an intersection.
 * @throws {TypeError} When `left` or `right` is not a function.
 */
export function intersection<TLeft extends AnyValidator, TRight extends AnyValidator>(
  left: TLeft,
  right: TRight,
): Composed<TLeft | TRight, Infer<TLeft> & Infer<TRight>> {
  assertFunction("left", left);
  assertFunction("right", right);
  const validate = (input: unknown): Maybe<ValidationResult<unknown>> =>
    chain(collect([left(input), right(input)]), ([first, second]) => {
      if (first?.ok && second?.ok) {
        const conflicts: ValidationIssue[] = [];
        const merged = merge(first.value, second.value, [], conflicts);
        return conflicts.length > 0 ? failWith(conflicts) : pass(merged);
      }
      return failWith([first, second].flatMap((result) => (result?.ok === false ? result.error.issues : [])));
    });
  return validate as unknown as Composed<TLeft | TRight, Infer<TLeft> & Infer<TRight>>;
}
