import { pass } from "../core/result";
import type { AnyValidator, Composed, Infer } from "../core/types";

/**
 * Wraps a validator so `null` and `undefined` are accepted and passed through, and every other value
 * goes to the wrapped validator. Inside `object`, the property becomes optional in the inferred type.
 *
 * @example
 * ```ts
 * const nickname = nullish(string({ min: 2 }));
 * nickname(null); // { ok: true, value: null }
 * nickname(undefined); // { ok: true, value: undefined }
 * ```
 *
 * @typeParam TValidator - The wrapped validator.
 * @param validator - The validator for values that are present.
 * @returns A validator that produces the wrapped type, `null` or `undefined`.
 */
export function nullish<TValidator extends AnyValidator>(
  validator: TValidator,
): Composed<TValidator, Infer<TValidator> | null | undefined> {
  const validate = (input: unknown) => (input === null || input === undefined ? pass(input) : validator(input));
  return validate as Composed<TValidator, Infer<TValidator> | null | undefined>;
}
