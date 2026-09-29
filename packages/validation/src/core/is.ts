import { isThenable } from "./async";
import type { Validator } from "./types";

/**
 * Tests whether an input passes a validator, narrowing its type when it does.
 *
 * @remarks
 * The narrowing is only accurate for a validator that does not change the value. A validator that
 * trims, coerces or transforms produces a different value than it was given, so read `result.value`
 * from calling the validator instead.
 *
 * @example
 * ```ts
 * const isPort = (input: unknown): input is number => is(number({ int: true, min: 1, max: 65535 }), input);
 * ```
 *
 * @typeParam T - The type the validator produces.
 * @param validator - A synchronous validator.
 * @param input - The value to test.
 * @returns `true` when the validator accepts the input.
 * @throws {TypeError} When the validator turns out to be asynchronous, which the type system prevents
 * unless the type was cast away. Use the validator directly and `await` it instead.
 */
export function is<T>(validator: Validator<T>, input: unknown): input is T {
  const result: unknown = validator(input);
  if (isThenable(result)) {
    // The promise is abandoned, so a later rejection is not reported as unhandled.
    // oxlint-disable-next-line promise/prefer-await-to-then
    result.then(undefined, () => undefined);
    throw new TypeError("is() needs a synchronous validator. Call the validator and await its result instead.");
  }
  return (result as { ok: boolean }).ok;
}
