import { assertFunction, assertText } from "../core/result";
import type { AnyValidator, Composed, Infer, InferInput } from "../core/types";

/**
 * A type marked with a name, so a value of the plain type is not accepted where the marked one is asked
 * for. The mark exists in the types alone: no value has the property. `null` and `undefined` are left
 * unmarked, so what an `optional` or a `nullable` validator produces keeps them.
 *
 * @typeParam T - The type that is marked.
 * @typeParam TName - The name of the mark.
 */
export type Branded<T, TName extends string> = T extends null | undefined
  ? T
  : T & { readonly "~brand": { readonly [K in TName]: true } };

/**
 * Marks what a validator produces with a name, in the types alone, so only a value that went through the
 * validator is accepted where the marked type is asked for.
 *
 * @remarks
 * TypeScript treats two types of the same shape as one, so a function that takes a `string` it calls a
 * user id also takes an email, or text nobody validated. A brand makes the validated type its own:
 * `Infer` of the result is the type with the mark, and the only way to a value of it is the validator.
 *
 * Nothing changes at run time. The validator is returned as it is, so it validates, is described and is
 * written as a JSON Schema exactly as before, and `name` is read by the types only. The input type is
 * not marked, since what is given to a validator has not passed it yet. Brands add up:
 * `brand(brand(string(), "A"), "B")` produces a type with both.
 *
 * @example
 * ```ts
 * const userId = brand(uuid(), "UserId");
 * type UserId = Infer<typeof userId>;
 *
 * declare function loadUser(id: UserId): Promise<User>;
 *
 * const result = userId(input);
 * if (result.ok) {
 *   await loadUser(result.value);
 * }
 * await loadUser("not validated"); // a compile error
 * ```
 *
 * @typeParam TValidator - The validator whose output is marked.
 * @typeParam TName - The name of the mark.
 * @param validator - The validator to mark the output of.
 * @param name - The name of the mark, such as `"UserId"`.
 * @returns The same validator, typed as producing the marked type.
 * @throws {TypeError} When `validator` is not a function or `name` is not text.
 */
export function brand<TValidator extends AnyValidator, const TName extends string>(
  validator: TValidator,
  name: TName,
): Composed<TValidator, Branded<Infer<TValidator>, TName>, InferInput<TValidator>> {
  assertFunction("validator", validator);
  assertText("name", name);
  return validator as Composed<TValidator, Branded<Infer<TValidator>, TName>, InferInput<TValidator>>;
}
