import { call, composed } from "../core/nesting";
import { assertFunction, assertUnshared, pass } from "../core/result";
import type { AnyValidator, Composed, Infer } from "../core/types";
import type { AnyFunction } from "../primitives/func";
import type { LiteralValue } from "../primitives/literal";

/**
 * A primitive value, or a function called for every use to produce the value. An object or a list would
 * be shared by every result, so it is produced by a function. When a function is among the types of the
 * value, only the function that produces it is accepted, since the value itself would be called.
 */
type Fallback<T> = [Extract<T, AnyFunction>] extends [never] ? (T & LiteralValue) | (() => T) : () => T;

/**
 * Wraps a validator so `undefined` is accepted, and every other value goes to the wrapped validator.
 * Inside `object`, the property then becomes optional in the inferred type.
 *
 * @remarks
 * Given a default, `undefined` is replaced by it instead, the output type no longer includes
 * `undefined`, and inside `object` the property is always present in the output. The default is
 * trusted and is not run through the wrapped validator. A primitive is used as it is, and a function is
 * called for every use to produce the default. An object or an array must come from a function, such as
 * `() => []`, since one value would be shared by every result and a change to one would show up in the
 * next: the types reject it, and so does `optional` when it is created. To use a function as the default
 * value itself, return it from a function, `optional(func(), () => noop)`, which the types require when
 * the wrapped validator can produce a function.
 *
 * @example
 * ```ts
 * const nickname = optional(string({ min: 2 }));
 * nickname(undefined); // { ok: true, value: undefined }
 * nickname(null); // { ok: false, ... }: null is not undefined
 *
 * const role = optional(oneOf(["admin", "user"]), "user");
 * role(undefined); // { ok: true, value: "user" }
 * const tags = optional(array(string()), () => []);
 * ```
 *
 * @typeParam TValidator - The wrapped validator.
 * @param validator - The validator for values that are present.
 * @param value - The default, or a function that returns it.
 * @returns A validator that produces the wrapped type, and `undefined` or the default for `undefined`.
 * @throws {TypeError} When `validator` is not a function, or `value` is an object or an array.
 */
export function optional<TValidator extends AnyValidator>(
  validator: TValidator,
): Composed<TValidator, Infer<TValidator> | undefined>;
export function optional<TValidator extends AnyValidator>(
  validator: TValidator,
  value: Fallback<Exclude<Infer<TValidator>, undefined>>,
): Composed<TValidator, Exclude<Infer<TValidator>, undefined>>;
export function optional(validator: AnyValidator, value?: Fallback<unknown>): AnyValidator {
  assertFunction("validator", validator);
  assertUnshared("A default object", value);
  return composed((input, place) =>
    input === undefined
      ? pass(typeof value === "function" ? (value as () => unknown)() : value)
      : call(validator, input, place),
  );
}
