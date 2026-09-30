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

/** A pair of values still to be merged, where the result goes, and how it was reached. */
interface Pending {
  left: unknown;
  right: unknown;
  place: (merged: unknown) => void;
  parent?: Pending;
  segment?: ValidationPathSegment;
}

/** The path from the root to a pair, built only when a conflict is reported there. */
function pathOf(pending: Pending): ValidationPathSegment[] {
  const path: ValidationPathSegment[] = [];
  for (let node: Pending | undefined = pending; node?.segment !== undefined; node = node.parent) {
    path.push(node.segment);
  }
  return path.reverse();
}

/**
 * Merges one pair, queueing the pairs inside it in `inner`. The same value on both sides is kept,
 * which is what a key both sides passed through unchecked holds, so a cycle in the input is never
 * followed, and so are two dates holding the same moment. Plain objects are merged key by key and
 * arrays of the same length item by item. Anything else cannot be both values at once, so it is
 * reported in `conflicts` at its path, and the right value stands in only so the walk can go on.
 */
function mergeOne(pending: Pending, inner: Pending[], conflicts: ValidationIssue[]): unknown {
  const { left, right } = pending;
  const time = timeOf(left);
  if (Object.is(left, right) || (time !== undefined && time === timeOf(right))) {
    return right;
  }
  if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
    const merged: unknown[] = Array.from({ length: left.length });
    for (let index = 0; index < left.length; index += 1) {
      const place = (value: unknown): void => {
        merged[index] = value;
      };
      inner.push({ left: left[index], right: right[index], place, parent: pending, segment: index });
    }
    return merged;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const merged: Record<string, unknown> = {};
    // setOwn defines an own data property, so no key can write to the prototype.
    for (const [key, value] of Object.entries(left)) {
      setOwn(merged, key, value);
    }
    for (const [key, value] of Object.entries(right)) {
      if (Object.hasOwn(merged, key)) {
        const place = (both: unknown): void => setOwn(merged, key, both);
        inner.push({ left: merged[key], right: value, place, parent: pending, segment: key });
      } else {
        setOwn(merged, key, value);
      }
    }
    return merged;
  }
  conflicts.push(toIssue({ code: "invalid_intersection", path: pathOf(pending) }));
  return right;
}

/**
 * Combines two validated values into one, depth first, reporting every place they conflict. It walks
 * with a list of its own rather than by recursion, so outputs nested deeper than the stack allows,
 * such as two parses of the same JSON, are merged instead of overflowing it.
 */
function merge(left: unknown, right: unknown, conflicts: ValidationIssue[]): unknown {
  let result: unknown;
  const pending: Pending[] = [
    {
      left,
      right,
      place: (merged) => {
        result = merged;
      },
    },
  ];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const inner: Pending[] = [];
    next.place(mergeOne(next, inner, conflicts));
    // Pushed last first, so they are taken in order and conflicts keep the order of the keys.
    for (let index = inner.length - 1; index >= 0; index -= 1) {
      pending.push(inner[index] as Pending);
    }
  }
  return result;
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
        const merged = merge(first.value, second.value, conflicts);
        return conflicts.length > 0 ? failWith(conflicts) : pass(merged);
      }
      return failWith([first, second].flatMap((result) => (result?.ok === false ? result.error.issues : [])));
    });
  return validate as unknown as Composed<TLeft | TRight, Infer<TLeft> & Infer<TRight>>;
}
