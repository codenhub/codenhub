import { pass } from "../core/result";
import type { AnyValidator, Composed, Infer } from "../core/types";

/**
 * Wraps a validator so `null` is accepted and passed through, and every other value goes to the
 * wrapped validator. `undefined` is not accepted; use `nullish` for both.
 *
 * @example
 * ```ts
 * const middleName = nullable(string({ min: 1 }));
 * middleName(null); // { ok: true, value: null }
 * middleName("Lee"); // { ok: true, value: "Lee" }
 * middleName(undefined); // { ok: false, ... }
 * ```
 *
 * @typeParam TValidator - The wrapped validator.
 * @param validator - The validator for values that are present.
 * @returns A validator that produces the wrapped type, or `null`.
 */
export function nullable<TValidator extends AnyValidator>(
  validator: TValidator,
): Composed<TValidator, Infer<TValidator> | null> {
  const validate = (input: unknown) => (input === null ? pass(null) : validator(input));
  return validate as Composed<TValidator, Infer<TValidator> | null>;
}
