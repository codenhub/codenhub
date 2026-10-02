import { chain, type Maybe } from "../core/async";
import { call, composed } from "../core/nesting";
import { assertFunction, pass } from "../core/result";
import type { AnyValidator, AsyncValidator, ValidationResult, Validator } from "../core/types";

/**
 * What a synchronous validator becomes once `convert` runs on its value: still synchronous when
 * `convert` never returns a promise, and asynchronous, producing what the promise settles to, when it
 * may return one, such as a function typed `number | Promise<number>`. A function typed as returning
 * `unknown` may return one too, so it makes the validator asynchronous. One typed as returning `any`,
 * such as `JSON.parse`, has opted out of type checking, and is taken at its word as synchronous: typing
 * it asynchronous would make the most common conversion need an `await` it never needs.
 */
type Transformed<R> = 0 extends 1 & R
  ? Validator<R>
  : [unknown] extends [R]
    ? AsyncValidator<Awaited<R>>
    : [Extract<R, PromiseLike<unknown>>] extends [never]
      ? Validator<R>
      : AsyncValidator<Awaited<R>>;

/**
 * Changes the value a validator produced into another value, such as text into a `Date`.
 *
 * @remarks
 * The function runs only when the wrapped validator succeeded, and receives the value it produced.
 * A function that returns a promise, or may return one, makes the result asynchronous, and the type
 * says so. The function cannot reject a value: to fail, write a validator that returns `fail(...)`
 * and put it after this one with `pipe`. A function that throws is a bug and propagates.
 *
 * @example
 * ```ts
 * const length = transform(string(), (text) => text.length);
 * length("four"); // { ok: true, value: 4 }
 *
 * const user = transform(string(), async (id) => await loadUser(id));
 * ```
 *
 * @typeParam T - The type the wrapped validator produces.
 * @typeParam R - The type the function returns.
 * @param validator - The validator to run first.
 * @param convert - Turns the validated value into the result.
 * @returns A validator that produces what `convert` returns.
 * @throws {TypeError} When `validator` or `convert` is not a function.
 */
export function transform<T, R>(validator: AnyValidator<T>, convert: (value: T) => PromiseLike<R>): AsyncValidator<R>;
export function transform<T, R>(validator: Validator<T>, convert: (value: T) => R): Transformed<R>;
export function transform<T, R>(validator: AnyValidator<T>, convert: (value: T) => R): AsyncValidator<Awaited<R>>;
export function transform<T, R>(validator: AnyValidator<T>, convert: (value: T) => Maybe<R>): AnyValidator<R> {
  assertFunction("validator", validator);
  assertFunction("convert", convert);
  return composed((input, place) =>
    chain(
      call(validator, input, place) as Maybe<ValidationResult<T>>,
      (result): Maybe<ValidationResult<R>> =>
        result.ok ? chain(convert(result.value), (converted) => pass(converted)) : result,
    ),
  ) as AnyValidator<R>;
}
