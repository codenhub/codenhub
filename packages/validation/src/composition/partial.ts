import { assertShape } from "../core/objects";
import type {
  AnyValidator,
  AsyncRest,
  AsyncSchema,
  Composed,
  Infer,
  InferInput,
  MessageOptions,
  Rest,
} from "../core/types";
import type { Shape, WithRest } from "./object";
import { optional } from "./optional";
import { mapping, type Listed, type Reshaped, type Unlisted } from "./reshape";

/** A shape with every property wrapped in `optional`. */
export type PartialShape<TShape extends Shape> = {
  [K in keyof TShape]: Composed<TShape[K], Infer<TShape[K]> | undefined, InferInput<TShape[K]> | undefined>;
};

/** The object type with every property optional, and the index signature it had. */
export type AllOptional<T> = WithRest<{ [K in keyof Listed<T>]?: Listed<T>[K] | undefined } & {}, Unlisted<T>>;

/**
 * Makes every property optional, for a form or an update where any field may be left out. Given a shape,
 * which is a plain object, it returns a new shape to pass to `object`. Given a validator `object`,
 * `strictObject`, `looseObject` or `objectWithRest` made, it returns a new object validator that treats the
 * keys its shape does not list as that one does, so a strict object stays strict, and keeps its `message`
 * unless one is given here.
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
 * @param rest - For a validator only: a `message` that replaces the object's, then checks on the new object.
 * @returns A shape whose every validator also accepts `undefined`, or an object validator of one.
 * @throws {TypeError} When `shape` is not a plain object or a property validator is not a function, or,
 * for a validator, when it was not made by `object` or has checks.
 */
export function partial<TShape extends Shape>(shape: TShape): PartialShape<TShape>;
export function partial<TValidator extends AnyValidator<object>>(
  validator: TValidator,
  ...rest: Rest<AllOptional<Infer<TValidator>>, MessageOptions>
): Reshaped<TValidator, AllOptional<Infer<TValidator>>, AllOptional<InferInput<TValidator>>>;
export function partial<TValidator extends AnyValidator<object>>(
  validator: TValidator,
  ...rest: AsyncRest<AllOptional<Infer<TValidator>>, MessageOptions>
): AsyncSchema<AllOptional<Infer<TValidator>>, AllOptional<InferInput<TValidator>>>;
export function partial(shape: Shape | AnyValidator, ...rest: unknown[]): Shape | AnyValidator {
  if (typeof shape === "function") {
    return mapping("partial", shape, optional, rest);
  }
  assertShape(shape);
  return Object.fromEntries(Object.entries(shape).map(([key, validator]) => [key, optional(validator)]));
}
