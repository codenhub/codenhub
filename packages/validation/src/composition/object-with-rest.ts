import { assertFunction } from "../core/result";
import type { AnyValidator, AsyncRest, AsyncSchema, Composed, MessageOptions, Rest } from "../core/types";
import { objectOf, type InferObject, type InferObjectInput, type Shape } from "./object";
import { validated } from "./unknown-keys";

/**
 * Creates a validator for plain objects with the given properties, which validates every other one.
 *
 * @remarks
 * It validates as `object` does, and gives each enumerable property the shape does not list to `rest`.
 * The output keeps what `rest` produces, after the listed properties and in the order of the input. Its
 * issues are at the key's path, after those of the listed properties, and stop at the 1,000 issues a
 * collection reports. The unlisted values are read before any property is validated. It is asynchronous
 * when a property validator or `rest` is.
 *
 * An unlisted `__proto__` is refused with an `invalid_key` issue, as a `record` refuses it, and its value
 * is still validated. The type gains an index signature that holds what `rest` produces and what the
 * listed properties hold, so that an object literal can be written with both.
 *
 * @example
 * ```ts
 * const flags = objectWithRest({ name: string() }, boolean());
 * flags({ name: "Ada", beta: true }); // { ok: true, value: { name: "Ada", beta: true } }
 * flags({ name: "Ada", beta: "yes" }); // { ok: false, ... }, code "invalid_type" at ["beta"]
 * ```
 *
 * @typeParam TShape - Property validators.
 * @typeParam TRest - The validator of the properties the shape does not list.
 * @param shape - Validator of each property.
 * @param rest - Validator of each property the shape does not list.
 * @param args - Options, then checks, which run once every property has passed and see the whole object.
 * @returns A validator that produces an object.
 * @throws {TypeError} When `shape` is not a plain object, or a property validator or `rest` is not a
 * validator.
 */
export function objectWithRest<TShape extends Shape, TRest extends AnyValidator>(
  shape: TShape,
  rest: TRest,
  ...args: Rest<InferObject<TShape, TRest>, MessageOptions>
): Composed<TShape[keyof TShape] | TRest, InferObject<TShape, TRest>, InferObjectInput<TShape, TRest>>;
export function objectWithRest<TShape extends Shape, TRest extends AnyValidator>(
  shape: TShape,
  rest: TRest,
  ...args: AsyncRest<InferObject<TShape, TRest>, MessageOptions>
): AsyncSchema<InferObject<TShape, TRest>, InferObjectInput<TShape, TRest>>;
export function objectWithRest(shape: Shape, rest: AnyValidator, ...args: unknown[]): AnyValidator {
  // Undefined would be read as an object that drops its unlisted keys.
  assertFunction("rest", rest);
  return objectOf(shape, args, rest, validated);
}
