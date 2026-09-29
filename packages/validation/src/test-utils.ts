import type { AsyncValidator, ValidationIssue, ValidationResult } from "./core/types";

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

/** An asynchronous validator that accepts strings not equal to `taken`, failing others with code `taken`. */
export const isFree: AsyncValidator<string> = async (input) => {
  await new Promise((resolve) => setTimeout(resolve, 1));
  return input === "taken"
    ? { ok: false, error: { issues: [{ code: "taken", path: [] }] } }
    : { ok: true, value: input as string };
};

/** Tests whether a validator's result is still pending, that is a promise rather than a plain result. */
export const isPending = (value: unknown): boolean => typeof value === "object" && value !== null && "then" in value;
