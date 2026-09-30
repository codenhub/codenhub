import { chain } from "../core/async";
import { assertFunction, toIssue, type IssueInput } from "../core/result";
import type { AsyncCheck, Check } from "../core/types";

/**
 * Makes a check from a test of a typed value, for a rule a validator's options do not express.
 *
 * @remarks
 * Give it to a validator after its options. It runs once the value has its type: for an object, once
 * every property has passed, so it can compare them. A test that returns a promise makes an
 * {@link AsyncCheck}, and the validator given it asynchronous.
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
 * ```
 *
 * @typeParam T - The type of the value it checks.
 * @param test - Returns `true` when the value is acceptable.
 * @param issue - What to report when it is not: an issue, or a string as its message. Defaults to code
 * `"custom"` at the value's own location.
 * @returns A check that reports the issue when `test` returns `false`.
 * @throws {TypeError} When `test` is not a function.
 */
export function check<T>(test: (value: T) => boolean, issue?: IssueInput | string): Check<T>;
export function check<T>(
  test: (value: T) => boolean | PromiseLike<boolean>,
  issue?: IssueInput | string,
): AsyncCheck<T>;
export function check<T>(
  test: (value: T) => boolean | PromiseLike<boolean>,
  issue: IssueInput | string = {},
): AsyncCheck<T> {
  assertFunction("test", test);
  const { path, params, ...rest } = typeof issue === "string" ? { message: issue } : issue;
  // Copied and frozen once, so neither the caller nor a result can change what a later failure reports.
  // The freeze is shallow: an object nested in params is the caller's own.
  const reported: IssueInput = {
    ...rest,
    ...(path !== undefined && { path: Object.freeze([...path]) }),
    ...(params !== undefined && { params: Object.freeze({ ...params }) }),
  };
  return (value) => chain(test(value), (isAccepted) => (isAccepted ? undefined : [toIssue(reported)]));
}
