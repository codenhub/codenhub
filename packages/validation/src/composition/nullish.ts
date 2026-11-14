import { runOf } from "../core/child";
import { toValidator } from "../core/make";
import type { Run } from "../core/run";
import type { AnyValidator, Composed, Infer, InferInput } from "../core/types";
import { NO_WORDS } from "../core/words";

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
 * @throws {TypeError} When `validator` is not a validator of this copy of the package.
 */
export function nullish<TValidator extends AnyValidator>(
  validator: TValidator,
): Composed<TValidator, Infer<TValidator> | null | undefined, InferInput<TValidator> | null | undefined> {
  const runInner = runOf(validator, "validator");
  const run: Run = (input) => (input === null || input === undefined ? input : runInner(input));
  run.w = runInner.w;
  return toValidator<
    Composed<TValidator, Infer<TValidator> | null | undefined, InferInput<TValidator> | null | undefined>
  >(run, { kind: "nullish", inner: validator }, NO_WORDS, [validator]);
}
