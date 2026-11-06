import { assertShape } from "../core/objects";
import type { AnyValidator, AsyncRest, AsyncSchema, Composed, Infer, InferInput, Rest } from "../core/types";
import type { ObjectOptions, Shape, UnknownKeys, WithRest } from "./object";
import { optional } from "./optional";
import { mapping, type Listed, type Remade, type RemadeInput, type ReshapedWith, type Unlisted } from "./reshape";

/** A shape with every property wrapped in `optional`. */
export type PartialShape<TShape extends Shape> = {
  [K in keyof TShape]: Composed<TShape[K], Infer<TShape[K]> | undefined, InferInput<TShape[K]> | undefined>;
};

/** The object type with every property optional, and the index signature it had. */
export type AllOptional<T> = WithRest<{ [K in keyof Listed<T>]?: Listed<T>[K] | undefined } & {}, Unlisted<T>>;

/**
 * Makes every property optional, for a form or an update where any field may be left out. Given a shape,
 * which is a plain object, it returns a new shape to pass to `object`. Given a validator `object` made,
 * it returns a new object validator with the same options, each option given here replacing the one of its
 * name.
 *
 * @remarks
 * An object validator with checks is refused, since a check may read a property that is now absent: give
 * the checks the new object needs here instead. What was given is unchanged either way.
 *
 * @example
 * ```ts
 * const user = { name: string({ min: 2 }), email: email() };
 * const create = object(user);
 * const update = object(partial(user)); // { name?: string; email?: string }
 * const patch = partial(create); // the same, from the validator
 * ```
 *
 * @typeParam TShape - The shape.
 * @typeParam TValidator - The object validator, when one is given in place of a shape.
 * @param shape - Property validators, or a validator made by `object`, without checks.
 * @param rest - For a validator only: options, each replacing the one of its name in the object, then checks on the
 * new object.
 * @returns A shape whose every validator also accepts `undefined`, or an object validator of one.
 * @throws {TypeError} When `shape` is not a plain object or a property validator is not a function, or,
 * for a validator, when it was not made by `object` or has checks.
 */
export function partial<TShape extends Shape>(shape: TShape): PartialShape<TShape>;
export function partial<TValidator extends AnyValidator<object>, TUnknownKeys extends UnknownKeys = "strip">(
  validator: TValidator,
  ...rest: Rest<Remade<AllOptional<Infer<TValidator>>, TUnknownKeys>, ObjectOptions<TUnknownKeys>>
): ReshapedWith<
  TValidator,
  TUnknownKeys,
  Remade<AllOptional<Infer<TValidator>>, TUnknownKeys>,
  RemadeInput<AllOptional<InferInput<TValidator>>, TUnknownKeys>
>;
export function partial<TValidator extends AnyValidator<object>, TUnknownKeys extends UnknownKeys = "strip">(
  validator: TValidator,
  ...rest: AsyncRest<Remade<AllOptional<Infer<TValidator>>, TUnknownKeys>, ObjectOptions<TUnknownKeys>>
): AsyncSchema<
  Remade<AllOptional<Infer<TValidator>>, TUnknownKeys>,
  RemadeInput<AllOptional<InferInput<TValidator>>, TUnknownKeys>
>;
export function partial(shape: Shape | AnyValidator, ...rest: unknown[]): Shape | AnyValidator {
  if (typeof shape === "function") {
    return mapping("partial", shape, optional, rest);
  }
  assertShape(shape);
  return Object.fromEntries(Object.entries(shape).map(([key, validator]) => [key, optional(validator)]));
}
