import { assertFunction, pass } from "../core/result";
import type { AnyValidator, Composed, Infer } from "../core/types";

/**
 * Wraps a validator so `undefined` is replaced by a default value, and every other value goes to
 * the wrapped validator. Inside `object`, the property is then always present in the output.
 *
 * @remarks
 * The default is trusted and is not run through the wrapped validator. A function is called for
 * every use to produce the default, so pass one for an object or array, which would otherwise be
 * shared by every result. To use a function as the default value itself, return it from a function.
 *
 * @example
 * ```ts
 * const role = withDefault(oneOf(["admin", "user"]), "user");
 * role(undefined); // { ok: true, value: "user" }
 * role("admin"); // { ok: true, value: "admin" }
 * role("guest"); // { ok: false, ... }: only undefined is replaced
 *
 * const tags = withDefault(array(string()), () => []);
 * ```
 *
 * @typeParam TValidator - The wrapped validator.
 * @param validator - The validator for values that are present.
 * @param value - The default, or a function that returns it.
 * @returns A validator that produces the wrapped type, never `undefined`.
 * @throws {TypeError} When `validator` is not a function.
 */
export function withDefault<TValidator extends AnyValidator>(
  validator: TValidator,
  value: Exclude<Infer<TValidator>, undefined> | (() => Exclude<Infer<TValidator>, undefined>),
): Composed<TValidator, Exclude<Infer<TValidator>, undefined>> {
  assertFunction("validator", validator);
  const validate = (input: unknown) =>
    input === undefined ? pass(typeof value === "function" ? (value as () => unknown)() : value) : validator(input);
  return validate as Composed<TValidator, Exclude<Infer<TValidator>, undefined>>;
}
