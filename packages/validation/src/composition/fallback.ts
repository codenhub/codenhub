import { chain } from "../core/async";
import { assertFunction, pass } from "../core/result";
import type { AnyValidator, Composed, Infer, ValidationIssue } from "../core/types";

/**
 * Wraps a validator so a value that fails it is replaced by a fallback instead of being rejected.
 * The result never fails.
 *
 * @remarks
 * The fallback is trusted and is not validated. A function is called with the issues that were
 * found, so it can log them, and its return value becomes the result. Use this sparingly: it turns
 * bad input into a valid-looking value, so reserve it for data where a sensible default is safer
 * than an error, such as a stored preference that may be out of date.
 *
 * @example
 * ```ts
 * const pageSize = fallback(number({ int: true, min: 1, max: 100 }), 20);
 * pageSize(50); // { ok: true, value: 50 }
 * pageSize("lots"); // { ok: true, value: 20 }
 * ```
 *
 * @typeParam TValidator - The wrapped validator.
 * @param validator - The validator to try first.
 * @param value - The fallback, or a function that receives the issues and returns it.
 * @returns A validator that produces the wrapped type and never fails.
 * @throws {TypeError} When `validator` is not a function.
 */
export function fallback<TValidator extends AnyValidator>(
  validator: TValidator,
  value: Infer<TValidator> | ((issues: readonly ValidationIssue[]) => Infer<TValidator>),
): Composed<TValidator, Infer<TValidator>> {
  assertFunction("validator", validator);
  const validate = (input: unknown) =>
    chain(validator(input), (result) =>
      result.ok
        ? result
        : pass(
            typeof value === "function"
              ? (value as (issues: readonly ValidationIssue[]) => unknown)(result.error.issues)
              : value,
          ),
    );
  return validate as Composed<TValidator, Infer<TValidator>>;
}
