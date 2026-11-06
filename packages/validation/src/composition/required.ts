import type { AnyValidator, AsyncRest, AsyncSchema, Infer, InferInput, Rest } from "../core/types";
import type { ObjectOptions, UnknownKeys } from "./object";
import { mapping, unwrapped, type AllRequired, type Remade, type RemadeInput, type ReshapedWith } from "./reshape";

/**
 * Creates an object validator whose properties are all required, from one where some are optional.
 *
 * @remarks
 * A property made with `optional` becomes the validator it wrapped, so its default is gone with it, and
 * one made with `nullish` becomes `nullable`, which still accepts `null`. Any other property is kept as
 * it is: one that accepts `undefined` some other way, such as `unknown()` or a `union` with
 * `literal(undefined)`, still does, though the type says otherwise.
 *
 * The validator must be one `object` made, and the new object keeps its options, each option given here
 * replacing the one of its name. One with checks is refused, since a check may rely on a property being absent: give the checks
 * the new object needs here instead.
 *
 * @example
 * ```ts
 * const draft = object({ title: optional(string()), body: optional(string()) });
 * const published = required(draft);
 * published({ title: "Hello" }); // fails: body is missing
 * ```
 *
 * @typeParam TValidator - The object validator to make required.
 * @param validator - A validator made by `object`, without checks.
 * @param rest - Options, each replacing the one of its name in the object, then checks on the new object.
 * @returns A validator made by `object`, with every property required.
 * @throws {TypeError} When the validator was not made by `object` or has checks.
 */
export function required<TValidator extends AnyValidator<object>, TUnknownKeys extends UnknownKeys = never>(
  validator: TValidator,
  ...rest: Rest<Remade<AllRequired<Infer<TValidator>>, TUnknownKeys>, ObjectOptions<TUnknownKeys>>
): ReshapedWith<
  TValidator,
  TUnknownKeys,
  Remade<AllRequired<Infer<TValidator>>, TUnknownKeys>,
  RemadeInput<AllRequired<InferInput<TValidator>>, TUnknownKeys>
>;
export function required<TValidator extends AnyValidator<object>, TUnknownKeys extends UnknownKeys = never>(
  validator: TValidator,
  ...rest: AsyncRest<Remade<AllRequired<Infer<TValidator>>, TUnknownKeys>, ObjectOptions<TUnknownKeys>>
): AsyncSchema<
  Remade<AllRequired<Infer<TValidator>>, TUnknownKeys>,
  RemadeInput<AllRequired<InferInput<TValidator>>, TUnknownKeys>
>;
export function required(validator: AnyValidator, ...rest: unknown[]): AnyValidator {
  return mapping("required", validator, unwrapped, rest);
}
