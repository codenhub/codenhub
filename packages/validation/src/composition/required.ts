import type { AnyValidator, AsyncRest, AsyncSchema, Infer, InferInput, MessageOptions, Rest } from "../core/types";
import { mapping, unwrapped, type AllRequired, type Reshaped } from "./reshape";

/**
 * Creates an object validator whose properties are all required, from one where some are optional.
 *
 * @remarks
 * A property made with `optional` becomes the validator it wrapped, so its default is gone with it, and
 * one made with `nullish` becomes `nullable`, which still accepts `null`. Any other property is kept as
 * it is: one that accepts `undefined` some other way, such as `unknown()` or a `union` with
 * `literal(undefined)`, still does, though the type says otherwise.
 *
 * The validator must be one `object`, `strictObject`, `looseObject` or `objectWithRest` made. The new
 * object treats the keys its shape does not list as that one does, so a strict object stays strict, and
 * keeps its `message` unless one is given here. One with checks is refused, since a check may rely on a
 * property being absent: give the checks the new object needs here instead.
 *
 * @example
 * ```ts
 * const draft = object({ title: optional(string()), body: optional(string()) });
 * const published = required(draft);
 * published({ title: "Hello" }); // fails: body is missing
 * ```
 *
 * @typeParam TValidator - The object validator to make required.
 * @param validator - A validator made by `object`, `strictObject`, `looseObject` or `objectWithRest`, without checks.
 * @param rest - A `message` that replaces the object's, then checks on the new object.
 * @returns A validator made by the same factory, with every property required.
 * @throws {TypeError} When the validator was not made by `object`, `strictObject`, `looseObject` or `objectWithRest`, or has checks.
 */
export function required<TValidator extends AnyValidator<object>>(
  validator: TValidator,
  ...rest: Rest<AllRequired<Infer<TValidator>>, MessageOptions>
): Reshaped<TValidator, AllRequired<Infer<TValidator>>, AllRequired<InferInput<TValidator>>>;
export function required<TValidator extends AnyValidator<object>>(
  validator: TValidator,
  ...rest: AsyncRest<AllRequired<Infer<TValidator>>, MessageOptions>
): AsyncSchema<AllRequired<Infer<TValidator>>, AllRequired<InferInput<TValidator>>>;
export function required(validator: AnyValidator, ...rest: unknown[]): AnyValidator {
  return mapping("required", validator, unwrapped, rest);
}
