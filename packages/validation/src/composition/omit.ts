import type { AnyValidator, AsyncRest, AsyncValidator, Infer, Rest, InferInput } from "../core/types";
import type { ObjectOptions } from "./object";
import { picking, type Omitted, type Reshaped } from "./reshape";

/**
 * Creates an object validator without the named properties of another.
 *
 * @remarks
 * The validator must be one `object` made, since its shape is read from what it describes itself with.
 * The new object keeps its options, `unknownKeys` and `message`, unless options are given here. One with
 * checks is refused: a check reads the whole object and may read a property that is left out, so give
 * the checks the smaller object needs here instead.
 *
 * @example
 * ```ts
 * const user = object({ id: uuid(), name: string(), password: string({ min: 12 }) });
 * const profile = omit(user, ["password"]);
 * type Profile = Infer<typeof profile>; // { id: string; name: string }
 * ```
 *
 * @typeParam TValidator - The object validator to omit from.
 * @typeParam TKey - The properties left out.
 * @param validator - A validator made by `object`, without checks.
 * @param keys - The properties to leave out, each of which the object has.
 * @param rest - Options, replacing those of the object, then checks on the new object.
 * @returns A validator made by `object`, of the other properties.
 * @throws {TypeError} When the validator was not made by `object`, has checks, or lacks one of the keys.
 */
export function omit<TValidator extends AnyValidator<object>, const TKey extends keyof Infer<TValidator>>(
  validator: TValidator,
  keys: readonly TKey[],
  ...rest: Rest<Omitted<Infer<TValidator>, TKey>, ObjectOptions>
): Reshaped<TValidator, Omitted<Infer<TValidator>, TKey>, Omit<InferInput<TValidator>, TKey>>;
export function omit<TValidator extends AnyValidator<object>, const TKey extends keyof Infer<TValidator>>(
  validator: TValidator,
  keys: readonly TKey[],
  ...rest: AsyncRest<Omitted<Infer<TValidator>, TKey>, ObjectOptions>
): AsyncValidator<Omitted<Infer<TValidator>, TKey>, Omit<InferInput<TValidator>, TKey>>;
export function omit(validator: AnyValidator, keys: readonly unknown[], ...rest: unknown[]): AnyValidator {
  return picking("omit", validator, keys, false, rest);
}
