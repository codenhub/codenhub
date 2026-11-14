import { standardOf } from "../core/make";
import { assertFunction, isResult } from "../core/result";
import { adopt, call, count, RUN, scopeNow, type Run } from "../core/run";
import { isThenable } from "../core/thenable";
import type { AsyncSchema, Schema, ValidationResult } from "../core/types";
import { tools } from "../core/wait";
import { NO_WORDS } from "../core/words";

/** What a function written by hand returns: a result, or a promise of one. */
export type Validated = ValidationResult<unknown> | PromiseLike<ValidationResult<unknown>>;

/** The type of the value in the results `TReturn` holds. */
export type ValidatedValue<TReturn> = Extract<Awaited<TReturn>, { ok: true; value: unknown }>["value"];

/**
 * Makes a validator from a function written by hand, for a value no factory or builder of this package
 * describes.
 *
 * @remarks
 * The function is given the input and returns `pass(value)` or `fail(issue)`, or a promise of one, which
 * makes the validator asynchronous. The paths of its issues are relative to the value it was given, and a
 * composer places them. A validator it calls in turn is part of the same validation.
 *
 * A composer takes no other function as a validator: what calls a function written by hand, and waits
 * for it, comes with `validator`, so a schema without one carries none of it.
 *
 * @example
 * ```ts
 * const even = validator((input) =>
 *   typeof input === "number" && input % 2 === 0 ? pass(input) : fail({ code: "odd" }),
 * );
 * even(4); // { ok: true, value: 4 }
 * object({ count: even })({ count: 3 }); // { ok: false, ... }, code "odd" at ["count"]
 * ```
 *
 * The type of the value is read from what the function returns, so a function that returns
 * `pass(input)` for a `number` makes a validator of `number`. To say it, type what the function returns,
 * as in `(input): ValidationResult<User> => ...`.
 *
 * @typeParam TReturn - What the function returns, which says the type of the value and whether it waits.
 * @typeParam TInput - The type of input that can pass, read from a function typed as a validator and
 * `unknown` otherwise.
 * @param validate - Returns the result for an input.
 * @returns A validator that gives what `validate` returns, asynchronous when `validate` may return a
 * promise.
 * @throws {TypeError} When `validate` is not a function. From the returned validator, when `validate`
 * returns something that is not a result, or a failure without issues.
 */
// One signature and not one for each of the two kinds, as the factories have: given two, the compiler reads
// `{ ok: true, value }` returned by an asynchronous function as `{ ok: boolean }` and matches neither.
export function validator<TReturn extends Validated, TInput = unknown>(
  validate: ((input: unknown) => TReturn) & { readonly "~types"?: { readonly input: TInput } },
): [Extract<TReturn, PromiseLike<unknown>>] extends [never]
  ? Schema<ValidatedValue<TReturn>, TInput>
  : AsyncSchema<ValidatedValue<TReturn>, TInput>;
export function validator(validate: (input: unknown) => unknown): unknown {
  assertFunction("validate", validate);
  const taken = (result: ValidationResult<unknown>): unknown => {
    if (!isResult(result)) {
      // Read as a result, it would fail on a property of `undefined`, or pass the value a failure
      // without issues was meant to refuse.
      throw new TypeError("A validator written by hand must return pass(value) or fail(issue)");
    }
    return result.ok ? result.value : adopt(result.error.issues);
  };
  const run: Run = (input) => {
    // A validator it calls in turn is part of this validation, so the validation is made before the call.
    scopeNow();
    const returned = validate(input) as ValidationResult<unknown> | PromiseLike<ValidationResult<unknown>>;
    return isThenable(returned) ? tools.wait(count(), returned, taken) : taken(returned);
  };
  run.w = tools;
  // It says nothing of itself, as a function a reader of the schema cannot see into.
  return Object.assign((input: unknown) => call(run, input), {
    [RUN]: run,
    "~words": NO_WORDS,
    "~standard": standardOf(run, NO_WORDS),
  });
}
