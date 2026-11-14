import { CHECKS } from "../core/check-run";
import {
  assertFunction,
  assertIssue,
  assertOption,
  assertParams,
  isPath,
  toIssue,
  type IssueInput,
} from "../core/result";
import { carry, word } from "../core/rule";
import { isThenable } from "../core/thenable";
import type { AsyncCheck, Check, Message, ValidationIssue } from "../core/types";

/**
 * What the test of a check answers: whether the value is acceptable, or the issues it found, none for a
 * value that is.
 */
export type CheckAnswer = boolean | readonly IssueInput[];

/** An issue the test wrote, as the result holds it. */
function written(each: unknown): ValidationIssue {
  assertIssue(each);
  return toIssue(each);
}

/**
 * Gives what the check reports for what its test answered, now when the answer is ready and once it is
 * otherwise. A thenable is adopted as `await` adopts it. `false` is what `report` returns, and a list is
 * the issues in it, worded by `message` when they have no wording of their own. Any other answer, such
 * as the `undefined` of a test that forgot to return, is a bug in the test and throws: read as a value
 * that passed, it would accept every value.
 */
const answered = (
  answer: unknown,
  report: () => ValidationIssue[],
  message: Message | undefined,
): ReturnType<AsyncCheck<never>> => {
  const decide = (settled: unknown): ValidationIssue[] | undefined => {
    if (typeof settled === "boolean") {
      return settled ? undefined : report();
    }
    if (!Array.isArray(settled)) {
      throw new TypeError("The test of a check must return a boolean or a list of issues");
    }
    return settled.length === 0 ? undefined : word([...settled].map(written), message);
  };
  // oxlint-disable-next-line promise/prefer-await-to-then
  return isThenable(answer) ? Promise.resolve(answer).then(decide) : decide(answer);
};

/**
 * Makes a check from a test of a typed value, for a rule a validator's options do not express.
 *
 * @remarks
 * Give it to a validator after its options. It runs once the value has its type and has passed the
 * validator's options, such as `min` and `max`: for an object, once every property has passed, so it can
 * compare them. A test that returns a promise makes an {@link AsyncCheck}, and the validator given it
 * asynchronous.
 *
 * A test that has more to say than yes or no returns the issues it found, each as `fail` takes one, and
 * an empty list for a value that passes. Their paths are relative to the value the check was given.
 *
 * A validator takes no other function as a check: what runs a check comes with `check`, so a schema
 * without one carries none of it.
 *
 * @example
 * ```ts
 * const even = check((n: number) => n % 2 === 0, "Must be even");
 * number({ int: true }, even);
 *
 * const signup = object(
 *   { password: string({ min: 8 }), confirm: string() },
 *   check((data) => data.password === data.confirm, { path: ["confirm"], message: "Passwords must match" }),
 * );
 *
 * const range = check((data: { from: number; to: number }) =>
 *   data.from <= data.to ? [] : [{ code: "range", path: ["from"] }, { code: "range", path: ["to"] }],
 * );
 * ```
 *
 * @typeParam T - The type of the value it checks.
 * @param test - Returns `true` when the value is acceptable and `false` when it is not, or the issues
 * it found.
 * @param issue - What to report when the test returns `false`: an issue, or a message, text or a
 * function of the issue, as a built-in check takes. Defaults to code `"custom"` at the value's own
 * location. Its message also words the issues of a list that have none.
 * @returns A check that reports the issue when `test` returns `false`, or the issues it returns.
 * @throws {TypeError} When `test` is not a function, or `issue` is neither a message nor an issue: an
 * object that is not a list, whose `code` and `message` are text when given, whose `path` is a list of keys
 * and indexes, each index an integer of zero or more, when given, and whose `params` is a plain object when
 * given. From the returned check, when `test` returns neither a boolean nor a list of issues.
 */
export function check<T>(test: (value: T) => CheckAnswer, issue?: IssueInput | Message): Check<T>;
export function check<T>(
  test: (value: T) => CheckAnswer | PromiseLike<CheckAnswer>,
  issue?: IssueInput | Message,
): AsyncCheck<T>;
export function check<T>(
  test: (value: T) => CheckAnswer | PromiseLike<CheckAnswer>,
  issue: IssueInput | Message = {},
): AsyncCheck<T> {
  assertFunction("test", test);
  if (typeof issue === "function") {
    // Worded when it fails, from the issue, as a built-in check's message function is.
    return carry<AsyncCheck<T>>((value) => answered(test(value), () => word([toIssue({})], issue), issue), CHECKS);
  }
  // A list, as in `[{ code: "x" }]`, would be read as an issue that says nothing.
  if (typeof issue !== "string" && (typeof issue !== "object" || issue === null || Array.isArray(issue))) {
    throw new TypeError("issue must be a message or an issue object");
  }
  const { path, params, ...rest } = typeof issue === "string" ? { message: issue } : issue;
  assertOption("code", rest.code, "string");
  assertOption("message", rest.message, "string");
  if (path !== undefined && !isPath(path)) {
    throw new TypeError("issue.path must be a list of keys and indexes");
  }
  assertParams(params);
  // Copied and frozen once, so neither the caller nor a result can change what a later failure reports.
  // The freeze is shallow: an object nested in params is the caller's own.
  const reported: IssueInput = {
    ...rest,
    ...(path !== undefined && { path: Object.freeze([...path]) }),
    ...(params !== undefined && { params: Object.freeze({ ...params }) }),
  };
  return carry<AsyncCheck<T>>((value) => answered(test(value), () => [toIssue(reported)], rest.message), CHECKS);
}
