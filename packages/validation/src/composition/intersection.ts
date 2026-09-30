import { chain, collect, type Maybe } from "../core/async";
import { isPlainObject, setOwn } from "../core/objects";
import { assertFunction, failWith, pass } from "../core/result";
import type { AnyValidator, Composed, Infer, ValidationResult } from "../core/types";

/**
 * Combines two validated values: plain objects are merged key by key, recursively, and anything else
 * takes the right value. The same value on both sides is kept as it is, which is what a key both
 * sides passed through unchecked holds, so a cycle in the input is never followed.
 */
function merge(left: unknown, right: unknown): unknown {
  if (left === right || !isPlainObject(left) || !isPlainObject(right)) {
    return right;
  }
  const merged: Record<string, unknown> = {};
  for (const source of [left, right]) {
    for (const [key, value] of Object.entries(source)) {
      // setOwn defines an own data property, so no key can write to the prototype.
      setOwn(merged, key, Object.hasOwn(merged, key) ? merge(merged[key], value) : value);
    }
  }
  return merged;
}

/**
 * Creates a validator that accepts a value only when it passes both validators, and produces the two
 * results merged.
 *
 * @remarks
 * Both validators receive the same input and both run, so the issues of each are reported together.
 * Plain-object outputs are merged key by key, recursively; for anything else the right validator's
 * output wins. Two `object`s with `unknownKeys: "strict"` never pass together, since each rejects the
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
        return pass(merge(first.value, second.value));
      }
      return failWith([first, second].flatMap((result) => (result?.ok === false ? result.error.issues : [])));
    });
  return validate as unknown as Composed<TLeft | TRight, Infer<TLeft> & Infer<TRight>>;
}
