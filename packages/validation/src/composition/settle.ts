import { chain, collect, type Maybe } from "../core/async";
import { append } from "../core/nesting";
import { failWith } from "../core/result";
import type { ValidationIssue, ValidationResult } from "../core/types";

/**
 * Gathers the results of validating each child of a collection, each already reporting its issues at
 * their full paths. When every child passed, `build` turns their values into the collection's result;
 * otherwise every issue is reported.
 */
export function settle(
  results: readonly Maybe<ValidationResult<unknown>>[],
  build: (values: unknown[]) => Maybe<ValidationResult<unknown>>,
): Maybe<ValidationResult<unknown>> {
  return chain(collect(results), (settled) => {
    const issues: ValidationIssue[] = [];
    const values: unknown[] = [];
    for (const result of settled) {
      if (result.ok) {
        values.push(result.value);
      } else {
        append(issues, result.error.issues);
      }
    }
    return issues.length > 0 ? failWith(issues) : build(values);
  });
}
