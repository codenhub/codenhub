import { assertFunction, pass } from "../core/result";
import type { AnyValidator, Composed, Infer } from "../core/types";

/** A value, or a function called for every use to produce it. */
type Fallback<T> = T | (() => T);

/**
 * Wraps a validator so `undefined` is accepted, and every other value goes to the wrapped validator.
 * Inside `object`, the property then becomes optional in the inferred type.
 *
 * @remarks
 * Given a default, `undefined` is replaced by it instead, the output type no longer includes
 * `undefined`, and inside `object` the property is always present in the output. The default is
 * trusted and is not run through the wrapped validator. A function is called for every use to produce
 * the default, so pass one for an object or array, which would otherwise be shared by every result. To
 * use a function as the default value itself, return it from a function.
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
 * @throws {TypeError} When `validator` is not a function.
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
  return (input) =>
    input === undefined ? pass(typeof value === "function" ? (value as () => unknown)() : value) : validator(input);
}
