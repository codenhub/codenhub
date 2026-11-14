import type { AnyValidator, AsyncRest, AsyncSchema, Composed, MessageOptions, Rest } from "../core/types";
import { objectOf, type InferObject, type InferObjectInput, type Shape } from "./object";
import { STRICT } from "./unknown-keys";

/**
 * Creates a validator for plain objects with the given properties and no other.
 *
 * @remarks
 * It validates as `object` does, and refuses each enumerable property the shape does not list with an
 * `unrecognized_key` issue at that key, before the listed properties are validated, up to the 1,000
 * issues a collection reports.
 *
 * @example
 * ```ts
 * const user = strictObject({ name: string() });
 * user({ name: "Ada" }); // { ok: true, value: { name: "Ada" } }
 * user({ name: "Ada", admin: true }); // { ok: false, ... }, code "unrecognized_key" at ["admin"]
 * ```
 *
 * @typeParam TShape - Property validators.
 * @param shape - Validator of each property.
 * @param rest - Options, then checks, which run once every property has passed and see the whole object.
 * @returns A validator that produces an object.
 * @throws {TypeError} When `shape` is not a plain object, or a property validator is not a validator.
 */
export function strictObject<TShape extends Shape>(
  shape: TShape,
  ...rest: Rest<InferObject<TShape>, MessageOptions>
): Composed<TShape[keyof TShape], InferObject<TShape>, InferObjectInput<TShape>>;
export function strictObject<TShape extends Shape>(
  shape: TShape,
  ...rest: AsyncRest<InferObject<TShape>, MessageOptions>
): AsyncSchema<InferObject<TShape>, InferObjectInput<TShape>>;
export function strictObject(shape: Shape, ...rest: unknown[]): AnyValidator {
  return objectOf(shape, rest, "strict", STRICT);
}
