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

/**
 * How many issues a list holds, counting the ones an issue holds behind it in `params.issues`, as the
 * issue of a `union` holds every option's: counted as one, a thousand items that each failed a union of
 * lists held two million. Issues nest at most three deep, so this does too.
 */
const weigh = (found: unknown): number => {
  if (Array.isArray(found)) {
    let weight = 0;
    for (const each of found) {
      weight += weigh(each);
    }
    return weight;
  }
  return 1 + weigh((found as ValidationIssue | null)?.params?.["issues"] ?? []);
};

/** How many issues a result holds, none when it passed. */
export const countIssues = (result: ValidationResult<unknown>): number => (result.ok ? 0 : weigh(result.error.issues));

/**
 * Runs `work` for each index below `length`, as `runEach` does, until the results that are not pending
 * hold `MAX_ISSUES` issues, counted by `count`. The list is shorter than `length` when it stopped. A
 * pending result cannot be counted, so every item of a collection whose items wait is started. A caller
 * that ran the first items itself gives the index to go on `from`, the issues `found` so far, and the
 * pending result that made it stop, which is waited for with the rest.
 */
export function runItems<R>(
  length: number,
  work: (index: number) => Maybe<R>,
  count: (result: R) => number,
  from = 0,
  found = 0,
  results: Maybe<R>[] = [],
): Maybe<R>[] {
  try {
    for (let index = from; index < length && found < MAX_ISSUES; index += 1) {
      const result = work(index);
      results.push(result);
      if (!isThenable(result)) {
        // oxlint-disable-next-line no-param-reassign
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
 * Cuts the issues of a collection at `MAX_ISSUES`, counted as `countIssues` counts them, when there are more, or when `isCut` says its items were
 * not all run, and adds the issue that says so: `too_big` with `type: "issues"`, at the collection's
 * `place`, worded by its `message`. The list is changed in place and returned.
 */
export function cap(
  issues: ValidationIssue[],
  place: Place,
  message: Message | undefined,
  isCut = false,
): ValidationIssue[] {
  // Cut after the issue that reaches the limit, counting what each holds.
  let kept = 0;
  for (let weight = 0; kept < issues.length && weight < MAX_ISSUES; kept += 1) {
    weight += weigh(issues[kept]);
  }
  if (isCut || kept < issues.length) {
    issues.length = kept;
    append(issues, report([issue("too_big", { maximum: MAX_ISSUES, type: "issues" })], place, message));
  }
  return issues;
}
