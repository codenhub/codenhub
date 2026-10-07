import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  InferInput,
  Rest,
  Validator,
} from "../core/types";
import type { InferShape, InferShapeInput, ObjectOptions, Shape } from "./object";
import { extending } from "./reshape";

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * The object type with the properties of `TShape` added, replacing any of the same name.
 *
 * @typeParam T - The object type extended.
 * @typeParam TShape - The validators of the properties added.
 */
export type Extended<T, TShape extends Shape> = Simplify<Omit<T, keyof TShape> & InferShape<TShape>>;

/** The input type with the properties of `TShape` added, replacing any of the same name. */
type ExtendedInput<T, TShape extends Shape> = Simplify<Omit<T, keyof TShape> & InferShapeInput<TShape>>;

/**
 * Creates an object validator with the properties of another and those given, as spreading the shape of
 * one into another does for an object made from shapes.
 *
 * @remarks
 * A module that exports an object validator, and not its shape, is extended with this. A property of the
 * same name as one the object has replaces it, in its place. The validator must be one `object` made,
 * since its shape is read from what it describes itself with. The new object keeps its options,
 * `unknownKeys` and `message`, unless options are given here. One with checks is refused: a check reads
 * the whole object and may read a property that is replaced, so give the checks the new object needs here
 * instead.
 *
 * @example
 * ```ts
 * const user = object({ name: string(), email: email() });
 * const admin = extend(user, { role: oneOf(["owner", "editor"]) });
 * admin({ name: "Ada", email: "ada@example.com", role: "owner" }); // { ok: true, value: { name: "Ada", ... } }
 * ```
 *
 * @typeParam TValidator - The object validator to extend.
 * @typeParam TShape - The validators of the properties added.
 * @param validator - A validator made by `object`, without checks.
 * @param shape - Validator of each property added or replaced.
 * @param rest - Options, replacing those of the object, then checks on the new object.
 * @returns A validator made by `object`, of the properties of both.
 * @throws {TypeError} When the validator was not made by `object` or has checks, or `shape` is not a plain
 * object of validators.
 */
export function extend<TValidator extends AnyValidator<object>, TShape extends Shape>(
  validator: TValidator,
  shape: TShape,
  ...rest: Rest<Extended<Infer<TValidator>, TShape>, ObjectOptions>
): TValidator extends Validator<unknown>
  ? Composed<TShape[keyof TShape], Extended<Infer<TValidator>, TShape>, ExtendedInput<InferInput<TValidator>, TShape>>
  : AsyncValidator<Extended<Infer<TValidator>, TShape>, ExtendedInput<InferInput<TValidator>, TShape>>;
export function extend<TValidator extends AnyValidator<object>, TShape extends Shape>(
  validator: TValidator,
  shape: TShape,
  ...rest: AsyncRest<Extended<Infer<TValidator>, TShape>, ObjectOptions>
): AsyncValidator<Extended<Infer<TValidator>, TShape>, ExtendedInput<InferInput<TValidator>, TShape>>;
export function extend(validator: AnyValidator, shape: Shape, ...rest: unknown[]): AnyValidator {
  return extending(validator, shape, rest);
}
