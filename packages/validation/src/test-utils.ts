import { type ValidationIssue, type ValidationResult } from "./issue";

/** Returns the issues of a result that must have failed. */
export function issuesOf(result: ValidationResult<unknown>): readonly ValidationIssue[] {
  if (result.ok) {
    throw new Error(`Expected a failure, got ${JSON.stringify(result.value)}`);
  }
  return result.error.issues;
}

/** Returns the value of a result that must have succeeded. */
export function valueOf<T>(result: ValidationResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected success, got ${result.error.message}`);
  }
  return result.value;
}

/** Returns the messages of a failed result. */
export const messagesOf = (result: ValidationResult<unknown>): string[] =>
  issuesOf(result).map((issue) => issue.message);

/** Returns the codes of a failed result. */
export const codesOf = (result: ValidationResult<unknown>): string[] => issuesOf(result).map((issue) => issue.code);

/** Returns the formatted-free paths of a failed result. */
export const pathsOf = (result: ValidationResult<unknown>): (readonly (string | number)[])[] =>
  issuesOf(result).map((issue) => issue.path);
