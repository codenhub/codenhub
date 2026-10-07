import { isThenable } from "./async";
import type { InferInput, Validator } from "./types";

/**
 * Tests whether an input passes a validator.
 *
 * @remarks
 * It narrows the input to the type the validator accepts, `InferInput`, which is not always the type it
 * produces: a validator that coerces or transforms produces another value than it was given, such as a
 * number from the text `"5"`, and what passed `coerceNumber()` was a number or text. Read `result.value`
 * from calling the validator for what it produces. A validator written by hand that does not say what it
 * accepts narrows nothing.
 *
 * @example
 * ```ts
 * const isPort = (input: unknown): input is number => is(number({ int: true, min: 1, max: 65535 }), input);
 *
 * if (is(string({ min: 1 }), value)) {
 *   value.toUpperCase(); // value is a string here
 * }
 * ```
 *
 * @typeParam TValidator - The validator, whose input type the input is narrowed to.
 * @param validator - A synchronous validator.
 * @param input - The value to test.
 * @returns `true` when the validator accepts the input.
 * @throws {TypeError} When the validator turns out to be asynchronous, which the type system prevents
 * unless the type was cast away. Use the validator directly and `await` it instead.
 */
export function is<TValidator extends Validator<unknown>>(
  validator: TValidator,
  input: unknown,
): input is InferInput<TValidator> {
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
