import { pass } from "../core/result";
import type { AnyValidator, Composed, Infer } from "../core/types";

/**
 * Wraps a validator so `undefined` is accepted and passed through, and every other value goes to the
 * wrapped validator. Inside `object`, the property then becomes optional in the inferred type.
 *
 * @example
 * ```ts
 * const nickname = optional(string({ min: 2 }));
 * nickname(undefined); // { ok: true, value: undefined }
 * nickname("Ad"); // { ok: true, value: "Ad" }
 * nickname(null); // { ok: false, ... }: null is not undefined
 * ```
 *
 * @typeParam TValidator - The wrapped validator.
 * @param validator - The validator for values that are present.
 * @returns A validator that produces the wrapped type, or `undefined`.
 */
export function optional<TValidator extends AnyValidator>(
  validator: TValidator,
): Composed<TValidator, Infer<TValidator> | undefined> {
  const validate = (input: unknown) => (input === undefined ? pass(undefined) : validator(input));
  return validate as Composed<TValidator, Infer<TValidator> | undefined>;
}
