import { described } from "../core/describe";
import { call, composed, fastOf } from "../core/nesting";
import { assertFunction, pass } from "../core/result";
import type { AnyValidator, Composed, Infer, InferInput } from "../core/types";

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
 * @throws {TypeError} When `validator` is not a function.
 */
export function nullable<TValidator extends AnyValidator>(
  validator: TValidator,
): Composed<TValidator, Infer<TValidator> | null, InferInput<TValidator> | null> {
  assertFunction("validator", validator);
  const inner = fastOf(validator);
  const validate = composed(
    (input, place) => (input === null ? pass(null) : call(validator, input, place)),
    inner === undefined ? undefined : (input) => (input === null ? null : inner(input)),
  );
  return described(validate, { kind: "nullable", inner: validator }) as Composed<
    TValidator,
    Infer<TValidator> | null,
    InferInput<TValidator> | null
  >;
}
