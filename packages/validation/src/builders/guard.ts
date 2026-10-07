import { decided } from "../core/async";
import { leaf, split } from "../core/checks";
import { described } from "../core/describe";
import { assertFunction, assertText } from "../core/result";
import type { Factory, MessageOptions } from "../core/types";

/**
 * Makes the factory of a validator for any type, from a type guard.
 *
 * @remarks
 * A value the guard rejects fails with `invalid_type` and `params.expected` set to `expected`. The
 * validators it makes take a `message` option and checks, as every built-in one does.
 *
 * @example
 * ```ts
 * const file = guard("File", (input): input is File => input instanceof File);
 * const upload = object({ avatar: file({ message: "Choose an image" }) });
 * ```
 *
 * @typeParam T - The type the guard accepts.
 * @param expected - The name of the type, for the issue.
 * @param accepts - Returns `true` for a value of the type.
 * @returns The factory of the validator.
 * @throws {TypeError} When `expected` is not text or `accepts` is not a function, and, from the
 * validator, when `accepts` returns a promise, which would accept every value: a rule that waits is a check.
 */
export function guard<T>(expected: string, accepts: (input: unknown) => input is T): Factory<T, MessageOptions> {
  assertText("guard(expected)", expected);
  assertFunction("accepts", accepts);
  return ((...args: unknown[]) => {
    const [options, checks] = split<MessageOptions, T>(args);
    // No fast test: the test is the consumer's code, which a miss would run a second time.
    const validator = leaf(
      expected,
      (input) => decided("guard", accepts, input),
      options.message,
      checks,
      undefined,
      false,
    );
    return described(validator, { kind: "guard", expected, options, checks });
  }) as Factory<T, MessageOptions>;
}
