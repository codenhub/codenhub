import { normalizeError, parseResult, type ValidationOptions, type ValidationResult } from "./result";

/**
 * Runs a custom validator and normalizes returned or thrown failures.
 *
 * The validator can return `ok()`, `err()`, a string, an `Error`, or structured
 * validation error options. Thrown values are captured and returned as failures
 * using the caller-provided validation path.
 */
export function custom<T>(
  value: unknown,
  validator: (value: unknown) => unknown,
  options: ValidationOptions = {},
): ValidationResult<T> {
  try {
    const result = parseResult<T>(validator(value));

    if (result.ok) {
      return result;
    }

    return { ok: false, error: normalizeError(result.error, options) };
  } catch (error) {
    return { ok: false, error: normalizeError(error, options) };
  }
}
