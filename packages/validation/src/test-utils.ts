import type { ValidationIssue, ValidationResult } from "./core/types";

/** The issues of a failed result, or an empty list for a successful one. */
export const issuesOf = (result: ValidationResult<unknown>): readonly ValidationIssue[] =>
  result.ok ? [] : result.error.issues;

/** The codes of a failed result's issues, in order. */
export const codesOf = (result: ValidationResult<unknown>): string[] => issuesOf(result).map((issue) => issue.code);

/** The `ok` flag of running a validator on each input, for checking many inputs at once. */
export const accepts = (validator: (input: unknown) => ValidationResult<unknown>, ...inputs: unknown[]): boolean[] =>
  inputs.map((input) => validator(input).ok);

/** The value of a successful result. Fails the test when the result is a failure. */
export const valueOf = <T>(result: ValidationResult<T>): T => {
  if (!result.ok) {
    throw new Error(`Expected success, got: ${JSON.stringify(result.error.issues)}`);
  }
  return result.value;
};
