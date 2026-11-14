import { runOf } from "../core/child";
import { toValidator } from "../core/make";
import type { Run } from "../core/run";
import type { AnyValidator, Composed, Infer, InferInput } from "../core/types";
import { NO_WORDS } from "../core/words";

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
  const runInner = runOf(validator, "validator");
  const run: Run = (input) => (input === null ? input : runInner(input));
  run.w = runInner.w;
  return toValidator<Composed<TValidator, Infer<TValidator> | null, InferInput<TValidator> | null>>(
    run,
    { kind: "nullable", inner: validator },
    NO_WORDS,
    [validator],
  );
}
