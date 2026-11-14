import { runOf, toolsOf } from "../core/child";
import { toValidator } from "../core/make";
import { count, FAIL, type Run } from "../core/run";
import type { AnyValidator, Composed, Infer, InferInput } from "../core/types";
import { NO_WORDS } from "../core/words";

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
 * @throws {TypeError} When no validator is given or one is not a validator of this copy of the package.
 */
export function pipe<const TValidators extends readonly [AnyValidator, ...AnyValidator[]]>(
  ...validators: TValidators
): Composed<TValidators[number], Output<TValidators>, InferInput<TValidators[0]>> {
  if (validators.length === 0) {
    // The types forbid it, but a pipe of nothing would accept every value unchecked.
    throw new TypeError("pipe() needs at least one validator");
  }
  const runs = validators.map((validator, index) => runOf(validator, `validators[${index}]`));
  const tools = toolsOf(runs);
  const last = runs.length - 1;
  // Run in a loop while the values are ready, each step given what the one before it produced.
  const from = (input: unknown, start: number): unknown => {
    let value = input;
    for (let index = start; index <= last; index += 1) {
      value = (runs[index] as Run)(value);
      if (value === FAIL) {
        return FAIL;
      }
      if (index < last && tools !== undefined && tools.is(value)) {
        return tools.after(count(), value, (later) => (later === FAIL ? FAIL : from(later, index + 1)));
      }
    }
    return value;
  };
  const run: Run = (input) => from(input, 0);
  run.w = tools;
  return toValidator(run, { kind: "pipe", steps: Object.freeze([...validators]) }, NO_WORDS, validators);
}
