import { chain, collect, type Maybe } from "../core/async";
import { cap, countIssues, runItems } from "../core/limit";
import { append, type Place } from "../core/nesting";
import { failWith } from "../core/result";
import type { Message, ValidationIssue, ValidationResult } from "../core/types";

/**
 * Validates each child of a collection with `work`, which reports its issues at their full paths, and
 * gathers the results. When every child passed, `build` turns their values into the collection's result;
 * otherwise the issues are reported, up to the limit of one collection, which also stops the children
 * that had not run.
 */
export function settle(
  length: number,
  work: (index: number) => Maybe<ValidationResult<unknown>>,
  place: Place,
  message: Message | undefined,
  build: (values: unknown[]) => Maybe<ValidationResult<unknown>>,
): Maybe<ValidationResult<unknown>> {
  return chain(collect(runItems(length, work, countIssues)), (settled) => {
    const issues: ValidationIssue[] = [];
    const values: unknown[] = [];
    for (const result of settled) {
      if (result.ok) {
        values.push(result.value);
      } else {
        append(issues, result.error.issues);
      }
    }
    return issues.length > 0 ? failWith(cap(issues, place, message, settled.length < length)) : build(values);
  });
}
