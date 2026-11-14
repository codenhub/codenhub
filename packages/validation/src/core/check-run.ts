/*
 * Runs checks that run a consumer's code or may wait: the ones `check` and `checkFields` make, and
 * `contentType`. A validator given one of them runs all its checks with this, and so brings the helpers
 * for results that wait. A validator given none of them reaches neither.
 */
import type { Finish, Runner } from "./finish";
import { adopt, count, detached, FAIL } from "./run";
import { isThenable } from "./thenable";
import type { AsyncCheck, ValidationIssue } from "./types";
import { tools } from "./wait";

type Found = readonly ValidationIssue[] | undefined;

/**
 * Runs every check, each apart from the validation running now, since it runs a consumer's code. It stays
 * synchronous while every check is, and from the first that waits on, the rest are started and waited for
 * together.
 */
const runChecks: Finish = (value, checks, message) => {
  const start = count();
  let failed = false;
  for (let index = 0; index < checks.length; index += 1) {
    const list = detached(checks[index] as AsyncCheck<unknown>, value);
    if (isThenable(list)) {
      const rest: (Found | PromiseLike<Found>)[] = [list];
      try {
        for (let later = index + 1; later < checks.length; later += 1) {
          rest.push(detached(checks[later] as AsyncCheck<unknown>, value));
        }
      } catch (error) {
        // Nothing will wait for the earlier checks now, so a rejection of one is handled.
        // oxlint-disable-next-line promise/prefer-await-to-then, promise/catch-or-return
        Promise.all(rest).catch(() => undefined);
        throw error;
      }
      return tools.wait(start, Promise.all(rest), (lists: readonly Found[]) => {
        for (const each of lists) {
          if (each !== undefined) {
            adopt(each, message);
            failed = true;
          }
        }
        return failed ? FAIL : value;
      });
    }
    if (list !== undefined) {
      adopt(list, message);
      failed = true;
    }
  }
  return failed ? FAIL : value;
};

/** What a check that runs a consumer's code, or that may wait, carries. */
export const CHECKS: Runner = { r: runChecks, w: tools };
