import { chain, collect, type Maybe } from "../core/async";
import { collectNested, failWith } from "../core/result";
import type { ValidationIssue, ValidationPathSegment, ValidationResult } from "../core/types";

/**
 * Gathers the results of validating each child of a collection. When every child passed, `build`
 * turns their values into the collection's result; otherwise every issue is reported, each under
 * the path segment of the child it came from (its index unless `segments` says otherwise).
 */
export function settle(
  results: readonly Maybe<ValidationResult<unknown>>[],
  build: (values: unknown[]) => Maybe<ValidationResult<unknown>>,
  segments?: readonly ValidationPathSegment[],
): Maybe<ValidationResult<unknown>> {
  return chain(collect(results), (settled) => {
    const issues: ValidationIssue[] = [];
    const values: unknown[] = [];
    settled.forEach((result, index) => {
      if (result.ok) {
        values.push(result.value);
      } else {
        collectNested(issues, result.error.issues, segments?.[index] ?? index);
      }
    });
    return issues.length > 0 ? failWith(issues) : build(values);
  });
}
