import { assertShape } from "../core/objects";
import type { Composed, Infer } from "../core/types";
import type { Shape } from "./object";
import { optional } from "./optional";

/** A shape with every property wrapped in `optional`. */
export type PartialShape<TShape extends Shape> = {
  [K in keyof TShape]: Composed<TShape[K], Infer<TShape[K]> | undefined>;
};

/**
 * Makes every property of a shape optional, for a form or an update where any field may be left out.
 * A shape is a plain object, so this returns a new one to pass to `object`; the original is unchanged.
 *
 * @example
 * ```ts
 * const user = { name: string({ min: 2 }), email: email() };
 * const create = object(user);
 * const update = object(partial(user)); // { name?: string; email?: string }
 * ```
 *
 * @typeParam TShape - The shape.
 * @param shape - Property validators.
 * @returns A shape whose every validator also accepts `undefined`.
 * @throws {TypeError} When `shape` is not a plain object, or a property validator is not a function.
 */
export function partial<TShape extends Shape>(shape: TShape): PartialShape<TShape> {
  assertShape(shape);
  return Object.fromEntries(
    Object.entries(shape).map(([key, validator]) => [key, optional(validator)]),
  ) as PartialShape<TShape>;
}
