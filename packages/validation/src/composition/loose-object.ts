import type { AnyValidator, AsyncRest, AsyncSchema, Composed, MessageOptions, Rest } from "../core/types";
import { objectOf, type InferObject, type InferObjectInput, type Shape } from "./object";
import { PASSTHROUGH } from "./unknown-keys";

/**
 * Creates a validator for plain objects with the given properties, which keeps every other one as it is.
 *
 * @remarks
 * It validates as `object` does, and copies each enumerable property the shape does not list to the
 * output, unchecked, after the listed properties and in the order of the input. They are read before any
 * property is validated. Its type lists only the properties of the shape.
 *
 * An unlisted `__proto__` is refused with an `invalid_key` issue: copied, it would become the prototype
 * of any copy of the output made by assignment. A shape that lists `__proto__` keeps it, as data.
 *
 * @example
 * ```ts
 * const user = looseObject({ name: string() });
 * user({ name: "Ada", admin: true }); // { ok: true, value: { name: "Ada", admin: true } }
 * ```
 *
 * @typeParam TShape - Property validators.
 * @param shape - Validator of each property.
 * @param rest - Options, then checks, which run once every property has passed and see the whole object.
 * @returns A validator that produces an object.
 * @throws {TypeError} When `shape` is not a plain object, or a property validator is not a validator.
 */
export function looseObject<TShape extends Shape>(
  shape: TShape,
  ...rest: Rest<InferObject<TShape>, MessageOptions>
): Composed<TShape[keyof TShape], InferObject<TShape>, InferObjectInput<TShape>>;
export function looseObject<TShape extends Shape>(
  shape: TShape,
  ...rest: AsyncRest<InferObject<TShape>, MessageOptions>
): AsyncSchema<InferObject<TShape>, InferObjectInput<TShape>>;
export function looseObject(shape: Shape, ...rest: unknown[]): AnyValidator {
  return objectOf(shape, rest, "passthrough", PASSTHROUGH);
}
