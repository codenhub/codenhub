import { chain } from "../core/async";
import { assertFunction, assertOption, toIssue, type IssueInput } from "../core/result";
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
 * @throws {TypeError} When `test` is not a function, or `issue` is neither text nor an issue: one whose
 * `code` and `message` are text when given, and whose `path` is a list.
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
  if (typeof issue !== "string" && (typeof issue !== "object" || issue === null)) {
    throw new TypeError("issue must be text or an issue object");
  }
  const { path, params, ...rest } = typeof issue === "string" ? { message: issue } : issue;
  assertOption("code", rest.code, "string");
  assertOption("message", rest.message, "string");
  // A path written as text, such as "confirm", would be spread into one segment per letter.
  if (path !== undefined && !Array.isArray(path)) {
    throw new TypeError("issue.path must be a list of keys and indexes");
  }
  // Copied and frozen once, so neither the caller nor a result can change what a later failure reports.
  // The freeze is shallow: an object nested in params is the caller's own.
  const reported: IssueInput = {
    ...rest,
    ...(path !== undefined && { path: Object.freeze([...path]) }),
    ...(params !== undefined && { params: Object.freeze({ ...params }) }),
  };
  return (value) => chain(test(value), (isAccepted) => (isAccepted ? undefined : [toIssue(reported)]));
}
