import { described } from "../core/describe";
import { call, composed, fastOf } from "../core/nesting";
import { assertFunction, pass } from "../core/result";
import type { AnyValidator, Composed, Infer, InferInput } from "../core/types";

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
 * @throws {TypeError} When `validator` is not a function.
 */
export function nullish<TValidator extends AnyValidator>(
  validator: TValidator,
): Composed<TValidator, Infer<TValidator> | null | undefined, InferInput<TValidator> | null | undefined> {
  assertFunction("validator", validator);
  const inner = fastOf(validator);
  const validate = composed(
    (input, place) => (input === null || input === undefined ? pass(input) : call(validator, input, place)),
    inner === undefined ? undefined : (input) => (input === null || input === undefined ? input : inner(input)),
  );
  return described(validate, { kind: "nullish", inner: validator }) as Composed<
    TValidator,
    Infer<TValidator> | null | undefined,
    InferInput<TValidator> | null | undefined
  >;
}
