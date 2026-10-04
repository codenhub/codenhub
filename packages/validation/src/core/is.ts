import { isThenable } from "./async";
import type { Validator } from "./types";

/**
 * Tests whether an input passes a validator.
 *
 * @remarks
 * It does not narrow the type of the input. A validator that trims, coerces or transforms produces
 * another value than it was given, such as a number from the text `"5"`, so the input is not of the
 * type the validator produces; read `result.value` from calling the validator for that. Where a
 * validator keeps the value as it is, write the guard yourself, as below.
 *
 * @example
 * ```ts
 * const isPort = (input: unknown): input is number => is(number({ int: true, min: 1, max: 65535 }), input);
 * ```
 *
 * @param validator - A synchronous validator.
 * @param input - The value to test.
 * @returns `true` when the validator accepts the input.
 * @throws {TypeError} When the validator turns out to be asynchronous, which the type system prevents
 * unless the type was cast away. Use the validator directly and `await` it instead.
 */
export function is(validator: Validator<unknown>, input: unknown): boolean {
  const result: unknown = validator(input);
  if (isThenable(result)) {
    // The promise is abandoned, so a later rejection is not reported as unhandled.
    // oxlint-disable-next-line promise/prefer-await-to-then
    result.then(undefined, () => undefined);
    throw new TypeError("is() needs a synchronous validator. Call the validator and await its result instead.");
  }
  // Compared, not returned, so a validator written by hand that sets `ok` to `1` still gives a boolean.
  return (result as { ok: unknown }).ok === true;
}
