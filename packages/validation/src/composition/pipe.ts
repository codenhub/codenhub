import { chain, type Maybe } from "../core/async";
import { described } from "../core/describe";
import { call, composed } from "../core/nesting";
import { assertFunction, pass } from "../core/result";
import type { AnyValidator, Composed, Infer, ValidationResult } from "../core/types";

/** The type produced by the last validator of a list. */
type Output<TValidators extends readonly AnyValidator[]> = TValidators extends readonly [
  ...AnyValidator[],
  infer TLast extends AnyValidator,
]
  ? Infer<TLast>
  : never;

/**
 * Runs validators one after another, feeding each the value the previous one produced.
 *
 * @remarks
 * The first failure stops the pipe, because a later step has nothing valid to work on. This is how
 * a string is cleaned before a format is checked, and how one rule follows another.
 *
 * @example
 * ```ts
 * const address = pipe(string({ trim: true, case: "lower" }), email());
 * address("  Ada@Example.com "); // { ok: true, value: "ada@example.com" }
 * ```
 *
 * @typeParam TValidators - The validators to run, in order. At least one.
 * @param validators - The validators to run, in order.
 * @returns A validator that produces what the last one produces.
 * @throws {TypeError} When no validator is given or one is not a function.
 */
export function pipe<const TValidators extends readonly [AnyValidator, ...AnyValidator[]]>(
  ...validators: TValidators
): Composed<TValidators[number], Output<TValidators>> {
  if (validators.length === 0) {
    // The types forbid it, but a pipe of nothing would accept every value unchecked.
    throw new TypeError("pipe() needs at least one validator");
  }
  validators.forEach((validator, index) => assertFunction(`validators[${index}]`, validator));
  const validate = composed(
    (input, place): Maybe<ValidationResult<unknown>> =>
      validators.reduce<Maybe<ValidationResult<unknown>>>(
        (previous, next) => chain(previous, (result) => (result.ok ? call(next, result.value, place) : result)),
        pass(input),
      ),
  );
  return described(validate, { kind: "pipe", steps: Object.freeze([...validators]) }) as unknown as Composed<
    TValidators[number],
    Output<TValidators>
  >;
}
