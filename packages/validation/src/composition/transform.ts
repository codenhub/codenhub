import { runOf } from "../core/child";
import { toValidator } from "../core/make";
import { assertFunction } from "../core/result";
import { after, count, detached, FAIL, type Run } from "../core/run";
import { isThenable } from "../core/thenable";
import type { AnyValidator, AsyncSchema, Schema, Validator } from "../core/types";
import { tools } from "../core/wait";
import { NO_WORDS } from "../core/words";

/** A value a promise resolved to is the value produced. */
const same = (value: unknown): unknown => value;

/**
 * What a synchronous validator becomes once `convert` runs on its value: still synchronous when
 * `convert` never returns a promise, and asynchronous, producing what the promise settles to, when it
 * may return one, such as a function typed `number | Promise<number>`. A function typed as returning
 * `unknown` may return one too, so it makes the validator asynchronous, as does one that returns any value
 * with a callable `then`, typed as a promise or not, since `await` treats it as one. One typed as returning `any`,
 * such as `JSON.parse`, has opted out of type checking, and is taken at its word as synchronous: typing
 * it asynchronous would make the most common conversion need an `await` it never needs.
 */
type Transformed<R, TInput> = 0 extends 1 & R
  ? Schema<R, TInput>
  : [unknown] extends [R]
    ? AsyncSchema<Awaited<R>, TInput>
    : [Extract<R, { then: (...args: never[]) => unknown }>] extends [never]
      ? Schema<R, TInput>
      : AsyncSchema<Awaited<R>, TInput>;

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
 * @throws {TypeError} When `validator` is not a validator of this copy of the package, or `convert` is not a function.
 */
export function transform<T, R, TInput = unknown>(
  validator: AnyValidator<T, TInput>,
  convert: (value: T) => PromiseLike<R>,
): AsyncSchema<R, TInput>;
export function transform<T, R, TInput = unknown>(
  validator: Validator<T, TInput>,
  convert: (value: T) => R,
): Transformed<R, TInput>;
export function transform<T, R, TInput = unknown>(
  validator: AnyValidator<T, TInput>,
  convert: (value: T) => R,
): AsyncSchema<Awaited<R>, TInput>;
export function transform<T, R>(
  validator: AnyValidator<T>,
  convert: (value: T) => R | PromiseLike<R>,
): AnyValidator<R> {
  const runInner = runOf(validator, "validator");
  assertFunction("convert", convert);
  const converted = (value: unknown): unknown => {
    if (value === FAIL) {
      return FAIL;
    }
    // A value with a `then` method is waited for, as `await` would wait for it.
    const made = detached(convert, value as T);
    return isThenable(made) ? tools.wait(count(), made, same) : made;
  };
  const run: Run = (input) => after(tools, count(), runInner(input), converted);
  // The function may return a promise whatever the validator does, so this one may always wait.
  run.w = tools;
  return toValidator(run, { kind: "transform", inner: validator, convert }, NO_WORDS, [validator]);
}
