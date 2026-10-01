import { leaf, split } from "../core/checks";
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
 * @throws {TypeError} When `expected` is not text or `accepts` is not a function.
 */
export function guard<T>(expected: string, accepts: (input: unknown) => input is T): Factory<T, MessageOptions> {
  assertText("guard(expected)", expected);
  assertFunction("accepts", accepts);
  return ((...args: unknown[]) => {
    const [{ message }, checks] = split<MessageOptions, T>(args);
    return leaf(expected, accepts, message, checks);
  }) as Factory<T, MessageOptions>;
}
