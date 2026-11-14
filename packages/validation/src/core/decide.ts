import { detached } from "./run";
import { isThenable } from "./thenable";

/**
 * Runs a test the consumer wrote, apart from the validation running now, and gives its answer. A promise
 * is refused with a `TypeError` naming `builder` and the function, `what`, since a pending answer is
 * truthy and would accept every value: a rule that waits belongs in a check, whose promise is awaited. A
 * conversion of a `codec` is refused the same way, since its validator is typed as synchronous.
 */
export function decided<A, R>(builder: string, test: (argument: A) => R, argument: A, what = "test"): R {
  const answer = detached(test, argument);
  if (isThenable(answer)) {
    // The promise is abandoned, so a later rejection is not reported as unhandled.
    // oxlint-disable-next-line promise/prefer-await-to-then
    answer.then(undefined, () => undefined);
    throw new TypeError(`${builder}() needs a synchronous ${what}. Put a rule that waits in a check.`);
  }
  return answer;
}
