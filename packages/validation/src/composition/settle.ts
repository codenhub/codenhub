import { chain, collect, isThenable, type Maybe } from "../core/async";
import { cap, countIssues, MAX_ISSUES, runItems } from "../core/limit";
import { append, type Place } from "../core/nesting";
import { failWith } from "../core/result";
import type { Message, ValidationIssue, ValidationResult } from "../core/types";

/**
 * Validates each child of a collection with `work`, which reports its issues at their full paths, and
 * gathers the results. When every child passed, `build` turns their values into the collection's result;
 * otherwise the issues are reported, up to the limit of one collection, which also stops the children
 * that had not run.
 *
 * The children are run and their results read in one pass while none is pending, which is the usual case
 * and needs no list of every result. From the first pending result on, the rest are started and waited
 * for together.
 */
export function settle(
  length: number,
  work: (index: number) => Maybe<ValidationResult<unknown>>,
  place: Place,
  message: Message | undefined,
  build: (values: unknown[]) => Maybe<ValidationResult<unknown>>,
): Maybe<ValidationResult<unknown>> {
  const issues: ValidationIssue[] = [];
  const values: unknown[] = [];
  const end = (ran: number): Maybe<ValidationResult<unknown>> =>
    issues.length > 0 ? failWith(cap(issues, place, message, ran < length)) : build(values);
  let found = 0;
  let index = 0;
  while (index < length && found < MAX_ISSUES) {
    const result = work(index);
    index += 1;
    if (isThenable(result)) {
      const ran = index - 1;
      return chain(collect(runItems(length, work, countIssues, index, found, [result])), (settled) => {
        for (const each of settled) {
          if (each.ok) {
            values.push(each.value);
          } else {
            append(issues, each.error.issues);
          }
        }
        return end(ran + settled.length);
      });
    }
    if (result.ok) {
      values.push(result.value);
    } else {
      append(issues, result.error.issues);
      found += countIssues(result);
    }
  }
  return end(index);
}
