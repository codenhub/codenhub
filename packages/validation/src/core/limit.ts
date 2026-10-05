/*
 * The most issues one collection reports. Every item of a collection may fail, and an item under a `union`
 * fails once per option, so without a limit the issues of a megabyte of bad items took a gigabyte and
 * seconds to build. A collection stops once its items have reported `MAX_ISSUES` issues, and says so with
 * one more issue. Only issues are counted, so the limit is never reached by input that passes, and input
 * that fails still fails.
 */
import { isThenable, type Maybe } from "./async";
import { report } from "./checks";
import { append, type Place } from "./nesting";
import { issue } from "./result";
import type { Message, ValidationIssue, ValidationResult } from "./types";

/** How many issues the items of one collection report before it stops. */
export const MAX_ISSUES = 1000;

/** How many issues a result holds, none when it passed. */
export const countIssues = (result: ValidationResult<unknown>): number => (result.ok ? 0 : result.error.issues.length);

/**
 * Runs `work` for each index below `length`, as `runEach` does, until the results that are not pending
 * hold `MAX_ISSUES` issues, counted by `count`. The list is shorter than `length` when it stopped. A
 * pending result cannot be counted, so every item of a collection whose items wait is started.
 */
export function runItems<R>(
  length: number,
  work: (index: number) => Maybe<R>,
  count: (result: R) => number,
): Maybe<R>[] {
  const results: Maybe<R>[] = [];
  let found = 0;
  try {
    for (let index = 0; index < length && found < MAX_ISSUES; index += 1) {
      const result = work(index);
      results.push(result);
      if (!isThenable(result)) {
        found += count(result);
      }
    }
  } catch (error) {
    // As in `runEach`: nothing will wait for the earlier results now, so a rejection of one is handled.
    // oxlint-disable-next-line promise/prefer-await-to-then, promise/catch-or-return
    Promise.all(results).catch(() => undefined);
    throw error;
  }
  return results;
}

/**
 * Cuts the issues of a collection at `MAX_ISSUES` when there are more, or when `isCut` says its items were
 * not all run, and adds the issue that says so: `too_big` with `type: "issues"`, at the collection's
 * `place`, worded by its `message`. The list is changed in place and returned.
 */
export function cap(
  issues: ValidationIssue[],
  place: Place,
  message: Message | undefined,
  isCut = false,
): ValidationIssue[] {
  if (isCut || issues.length > MAX_ISSUES) {
    issues.length = Math.min(issues.length, MAX_ISSUES);
    append(issues, report([issue("too_big", { maximum: MAX_ISSUES, type: "issues" })], place, message));
  }
  return issues;
}
