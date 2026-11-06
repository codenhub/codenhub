import type { AnyValidator, AsyncRest, AsyncSchema, Infer, InferInput, Rest } from "../core/types";
import type { ObjectOptions, UnknownKeys } from "./object";
import { picking, type ListedKey, type Picked, type Remade, type RemadeInput, type ReshapedWith } from "./reshape";

/**
 * Creates an object validator with only the named properties of another.
 *
 * @remarks
 * The validator must be one `object` made, since its shape is read from what it describes itself with.
 * The new object keeps its options, `unknownKeys` and `message`, and each option given here replaces the
 * one of its name, so a strict object stays strict given only a `message`. A validator of unknown keys is
 * kept too, and validates a property left out when the input has it. One with checks is refused: a check
 * reads the whole object and may read a property that is left out, so give the checks the smaller object
 * needs here instead.
 *
 * @example
 * ```ts
 * const user = object({ id: uuid(), name: string(), email: email() });
 * const contact = pick(user, ["name", "email"]);
 * contact({ name: "Ada", email: "ada@example.com" }); // { ok: true, value: { name: "Ada", email: "ada@example.com" } }
 * ```
 *
 * @typeParam TValidator - The object validator to pick from.
 * @typeParam TKey - The properties kept.
 * @param validator - A validator made by `object`, without checks.
 * @param keys - The properties to keep, each of which the object has.
 * @param rest - Options, each replacing the one of its name in the object, then checks on the new object.
 * @returns A validator made by `object`, of the named properties.
 * @throws {TypeError} When the validator was not made by `object`, has checks, or lacks one of the keys.
 */
export function pick<
  TValidator extends AnyValidator<object>,
  const TKey extends ListedKey<Infer<TValidator>>,
  TUnknownKeys extends UnknownKeys = "strip",
>(
  validator: TValidator,
  keys: readonly TKey[],
  ...rest: Rest<Remade<Picked<Infer<TValidator>, TKey>, TUnknownKeys>, ObjectOptions<TUnknownKeys>>
): ReshapedWith<
  TValidator,
  TUnknownKeys,
  Remade<Picked<Infer<TValidator>, TKey>, TUnknownKeys>,
  RemadeInput<Picked<InferInput<TValidator>, TKey & ListedKey<InferInput<TValidator>>>, TUnknownKeys>
>;
export function pick<
  TValidator extends AnyValidator<object>,
  const TKey extends ListedKey<Infer<TValidator>>,
  TUnknownKeys extends UnknownKeys = "strip",
>(
  validator: TValidator,
  keys: readonly TKey[],
  ...rest: AsyncRest<Remade<Picked<Infer<TValidator>, TKey>, TUnknownKeys>, ObjectOptions<TUnknownKeys>>
): AsyncSchema<
  Remade<Picked<Infer<TValidator>, TKey>, TUnknownKeys>,
  RemadeInput<Picked<InferInput<TValidator>, TKey & ListedKey<InferInput<TValidator>>>, TUnknownKeys>
>;
export function pick(validator: AnyValidator, keys: readonly unknown[], ...rest: unknown[]): AnyValidator {
  return picking("pick", validator, keys, true, rest);
}
