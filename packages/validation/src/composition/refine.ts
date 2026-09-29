import { chain, type Maybe } from "../core/async";
import { fail } from "../core/result";
import type { IssueInput } from "../core/result";
import type { AnyValidator, AsyncValidator, ValidationResult, Validator } from "../core/types";

/** How a failed {@link refine} check is reported. A string is shorthand for `{ message }`. */
export type RefineIssue = IssueInput | string;

/**
 * Adds a rule the wrapped validator cannot express, such as two fields having to match.
 *
 * @remarks
 * The check runs only when the wrapped validator succeeded, and receives the value it produced. A
 * check that returns a promise, such as a database lookup, makes the result asynchronous, and the
 * type says so. To report several issues at once or choose the path per failure, write a validator
 * function instead.
 *
 * @example
 * ```ts
 * const signup = refine(
 *   object({ password: string({ min: 8 }), confirm: string() }),
 *   (data) => data.password === data.confirm,
 *   { message: "Passwords must match", path: ["confirm"] },
 * );
 * ```
 *
 * @typeParam T - The type the wrapped validator produces.
 * @param validator - The validator to add the rule to.
 * @param check - Returns `true` when the value is acceptable.
 * @param issue - How to report a rejected value. Defaults to code `"custom"`.
 * @returns A validator with the same output type as the wrapped one.
 */
export function refine<T>(validator: Validator<T>, check: (value: T) => boolean, issue?: RefineIssue): Validator<T>;
export function refine<T>(
  validator: AnyValidator<T>,
  check: (value: T) => boolean | PromiseLike<boolean>,
  issue?: RefineIssue,
): AsyncValidator<T>;
export function refine<T>(
  validator: AnyValidator<T>,
  check: (value: T) => boolean | PromiseLike<boolean>,
  issue: RefineIssue = {},
): AnyValidator<T> {
  const { path, ...rest } = typeof issue === "string" ? { message: issue } : issue;
  // The path is copied and frozen once, and every rejection builds its own issue around it, so no
  // result shares anything a caller could change with the next one.
  const reported: IssueInput = path === undefined ? rest : { ...rest, path: Object.freeze([...path]) };
  return (input) =>
    chain(validator(input), (result): Maybe<ValidationResult<T>> => {
      if (!result.ok) {
        return result;
      }
      return chain(check(result.value), (isAccepted) => (isAccepted ? result : fail(reported)));
    });
}
