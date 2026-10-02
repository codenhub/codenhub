import { chain, detached } from "../core/async";
import { assertFunction, assertUnshared, pass } from "../core/result";
import type { AnyValidator, Composed, Infer, ValidationIssue } from "../core/types";
import type { AnyFunction } from "../primitives/func";
import type { LiteralValue } from "../primitives/literal";

/**
 * A primitive fallback, or a function that receives the issues and returns the fallback. An object or a
 * list would be shared by every result, so it is returned by a function. When a function is among the
 * types of the fallback, only the function that returns it is accepted, since the fallback itself would be
 * called.
 */
type Replacement<T> = [Extract<T, AnyFunction>] extends [never]
  ? (T & LiteralValue) | ((issues: readonly ValidationIssue[]) => T)
  : (issues: readonly ValidationIssue[]) => T;

/**
 * Wraps a validator so a value that fails it is replaced by a fallback instead of being rejected.
 * The result never fails.
 *
 * @remarks
 * The fallback is trusted and is not validated. A function is called with the issues that were
 * found, so it can log them, and its return value becomes the result. A primitive is used as it is. An
 * object or an array must come from a function, such as `() => []`, since one value would be shared by
 * every result and a change to one would show up in the next: the types reject it, and so does
 * `fallback` when it is created. A fallback that is itself a function has to be
 * returned from one, `fallback(func(), () => noop)`, which the types require when the wrapped validator
 * can produce a function. Use this sparingly: it turns
 * bad input into a valid-looking value, so reserve it for data where a sensible default is safer
 * than an error, such as a stored preference that may be out of date.
 *
 * @example
 * ```ts
 * const pageSize = fallback(number({ int: true, min: 1, max: 100 }), 20);
 * pageSize(50); // { ok: true, value: 50 }
 * pageSize("lots"); // { ok: true, value: 20 }
 * ```
 *
 * @typeParam TValidator - The wrapped validator.
 * @param validator - The validator to try first.
 * @param value - The fallback, or a function that receives the issues and returns it.
 * @returns A validator that produces the wrapped type and never fails.
 * @throws {TypeError} When `validator` is not a function, or `value` is an object or an array.
 */
export function fallback<TValidator extends AnyValidator>(
  validator: TValidator,
  value: Replacement<Infer<TValidator>>,
): Composed<TValidator, Infer<TValidator>> {
  assertFunction("validator", validator);
  assertUnshared("A fallback object", value);
  const validate = (input: unknown) =>
    chain(validator(input), (result) =>
      result.ok
        ? result
        : pass(
            typeof value === "function"
              ? detached(value as (issues: readonly ValidationIssue[]) => unknown, result.error.issues)
              : value,
          ),
    );
  return validate as Composed<TValidator, Infer<TValidator>>;
}
