import { chain, collect, runEach, type Maybe } from "../core/async";
import { tail } from "../core/checks";
import { cap } from "../core/limit";
import { call, composed } from "../core/nesting";
import { entriesOf, isArray, isPlainObject, setOwn, sizeOfMap, sizeOfSet, timeOf, valuesOf } from "../core/objects";
import { assertFunction, failWith, issue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  MessageOptions,
  Rest,
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

/** A step of the walk: a pair to merge, or work to finish once every pair queued before it is merged. */
type Step = Pending | (() => void);

/** What each pair of objects already met was merged into, so a pair met again is not walked again. */
type Merged = Map<object, Map<object, unknown>>;

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
 * which is what a key both sides passed through unchecked holds, and so are two dates holding the same
 * moment. A pair of objects met before, as a cycle or a shared reference in the outputs meets it, gives
 * what it was merged into the first time, so the output keeps that shape and the walk ends. Plain
 * objects are merged key by key and arrays of the same length item by item. Maps and sets of the same
 * size are merged entry by entry in iteration order: both validators read the same input in the same
 * order, so the entries at one position come from the same input entry. Their contents are filled in by
 * a last step queued after the pairs inside them. Anything else cannot be both values at once, so it is
 * reported in `conflicts` at its path, and the right value stands in only so the walk can go on.
 */
function mergeOne(pending: Pending, inner: Step[], conflicts: ValidationIssue[], merged: Merged): unknown {
  const { left, right } = pending;
  if (Object.is(left, right)) {
    return right;
  }
  // The one pair `===` holds for and Object.is does not is 0 and -0, the same number, merged as 0.
  if (left === right) {
    return 0;
  }
  // Two values that differ and are not both objects can be nothing but a conflict.
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    conflicts.push(issue("invalid_intersection", undefined, pathOf(pending)));
    return right;
  }
  if (merged.get(left)?.has(right) === true) {
    return merged.get(left)?.get(right);
  }
  const remember = <T>(output: T): T => {
    const byRight = merged.get(left) ?? new Map<object, unknown>();
    byRight.set(right, output);
    merged.set(left, byRight);
    return output;
  };
  const queue = (pair: Omit<Pending, "parent">): void => {
    inner.push({ ...pair, parent: pending });
  };

  // `isArray` and not `Array.isArray`, which throws for a revoked proxy one side passed through as it is.
  if (isArray(left) && isArray(right) && left.length === right.length) {
    const output = remember<unknown[]>(Array.from({ length: left.length }));
    for (let index = 0; index < left.length; index += 1) {
      const place = (value: unknown): void => {
        output[index] = value;
      };
      queue({ left: left[index], right: right[index], place, segment: index });
    }
    return output;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const output = remember<Record<string, unknown>>({});
    // setOwn defines an own data property, so no key can write to the prototype.
    for (const [key, value] of Object.entries(left)) {
      setOwn(output, key, value);
    }
    for (const [key, value] of Object.entries(right)) {
      if (Object.hasOwn(output, key)) {
        const place = (both: unknown): void => setOwn(output, key, both);
        queue({ left: output[key], right: value, place, segment: key });
      } else {
        setOwn(output, key, value);
      }
    }
    return output;
  }
  // Asked only now: asking whether a value is a Date, a Map or a Set throws and catches inside for a value
  // that is not, which for every array or plain object cost ten times the validation itself.
  const time = timeOf(left);
  if (time !== undefined && time === timeOf(right)) {
    return right;
  }
  const mapSize = sizeOfMap(left);
  if (mapSize !== undefined && mapSize === sizeOfMap(right)) {
    const output = remember(new Map<unknown, unknown>());
    const rightEntries = entriesOf(right);
    const keys: unknown[] = [];
    const values: unknown[] = [];
    entriesOf(left).forEach(([leftKey, leftValue], index) => {
      const [rightKey, rightValue] = rightEntries[index] as [unknown, unknown];
      // A string key names its entry, as it does in `map`; any other key is named by its position.
      const segment = typeof leftKey === "string" && leftKey === rightKey ? leftKey : index;
      const placeKey = (key: unknown): void => {
        keys[index] = key;
      };
      const placeValue = (value: unknown): void => {
        values[index] = value;
      };
      queue({ left: leftKey, right: rightKey, place: placeKey, segment });
      queue({ left: leftValue, right: rightValue, place: placeValue, segment });
    });
    inner.push(() => keys.forEach((key, index) => output.set(key, values[index])));
    return output;
  }
  const setSize = sizeOfSet(left);
  if (setSize !== undefined && setSize === sizeOfSet(right)) {
    const output = remember(new Set<unknown>());
    const rightValues = valuesOf(right);
    const values: unknown[] = [];
    valuesOf(left).forEach((leftValue, index) => {
      const place = (value: unknown): void => {
        values[index] = value;
      };
      queue({ left: leftValue, right: rightValues[index], place, segment: index });
    });
    inner.push(() => values.forEach((value) => output.add(value)));
    return output;
  }
  conflicts.push(issue("invalid_intersection", undefined, pathOf(pending)));
  return right;
}

/**
 * Combines two validated values into one, depth first, reporting every place they conflict. It walks
 * with a list of its own rather than by recursion, so outputs nested deeper than the stack allows,
 * such as two parses of the same JSON, are merged instead of overflowing it.
 */
function merge(left: unknown, right: unknown, conflicts: ValidationIssue[]): unknown {
  let result: unknown;
  const merged: Merged = new Map();
  const steps: Step[] = [
    {
      left,
      right,
      place: (value) => {
        result = value;
      },
    },
  ];
  for (let next = steps.pop(); next !== undefined; next = steps.pop()) {
    if (typeof next === "function") {
      next();
      continue;
    }
    const inner: Step[] = [];
    next.place(mergeOne(next, inner, conflicts, merged));
    // Pushed last first, so they are taken in order and conflicts keep the order of the keys. The step
    // that fills a map or a set is queued last, so it runs once every pair inside it is merged.
    for (let index = inner.length - 1; index >= 0; index -= 1) {
      steps.push(inner[index] as Step);
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
 * The outputs are merged: plain objects key by key, arrays of the same length item by item, and maps
 * and sets of the same size entry by entry in iteration order, which both validators keep from the
 * input, recursively, so maps keyed by objects and sets of objects merge too. Any other pair must be the
 * same value, `0` and `-0` merging as `0`, or two dates holding the same moment. Where the outputs differ otherwise, such as
 * `"  ab "` trimmed on one side and uppercased on the other, no value satisfies both, so each such place
 * fails with `invalid_intersection` at its path, rather than one side silently winning, up to the 1,000 issues a collection reports. Cyclic or
 * shared objects in the outputs are merged once, and the merged output keeps their shape. Two `object`s
 * with `unknownKeys: "strict"` never pass together, since each rejects the keys only the other lists;
 * spread their shapes into one strict object instead. It is synchronous when both validators are, and
 * asynchronous otherwise.
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
  ...rest: Rest<Infer<TLeft> & Infer<TRight>, MessageOptions>
): Composed<TLeft | TRight, Infer<TLeft> & Infer<TRight>>;
export function intersection<TLeft extends AnyValidator, TRight extends AnyValidator>(
  left: TLeft,
  right: TRight,
  ...rest: AsyncRest<Infer<TLeft> & Infer<TRight>, MessageOptions>
): AsyncValidator<Infer<TLeft> & Infer<TRight>>;
export function intersection(left: AnyValidator, right: AnyValidator, ...rest: unknown[]): AnyValidator {
  assertFunction("left", left);
  assertFunction("right", right);
  const [, reject, accept] = tail<MessageOptions, unknown>(rest);
  return composed(
    (input, place): Maybe<ValidationResult<unknown>> =>
      chain(collect(runEach(2, (index) => call(index === 0 ? left : right, input, place))), ([first, second]) => {
        if (first?.ok && second?.ok) {
          const conflicts: ValidationIssue[] = [];
          const merged = merge(first.value, second.value, conflicts);
          return conflicts.length > 0 ? reject(cap(conflicts, undefined, undefined), place) : accept(merged, place);
        }
        return failWith([first, second].flatMap((result) => (result?.ok === false ? result.error.issues : [])));
      }),
  );
}
