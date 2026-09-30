import { chain, collect, type Maybe } from "./async";
import { failWith, pass, typeIssue } from "./result";
import type { AsyncCheck, Message, MessageOptions, ValidationIssue, ValidationResult } from "./types";

/**
 * Separates the arguments of a factory, `(options?, ...checks)`, into its options and its checks. An
 * object is the options and a function is a check, so the options can be left out.
 */
export function split<TOptions extends MessageOptions, T>(
  args: readonly unknown[],
): [options: TOptions, checks: AsyncCheck<T>[]] {
  const [first, ...rest] = args;
  const [options, checks] = typeof first === "function" ? [{}, args] : [first ?? {}, rest];
  if (checks.some((check) => typeof check !== "function")) {
    // A check that is not a function is a mistake in the schema, reported now rather than on the first input.
    throw new TypeError("Checks must be functions");
  }
  return [options as TOptions, checks as AsyncCheck<T>[]];
}

/** Gives a validator's own issues its wording, when it has one. The issues are replaced in place. */
export function word(issues: ValidationIssue[], message: Message | undefined): ValidationIssue[] {
  if (message !== undefined) {
    issues.forEach((found, index) => {
      issues[index] = { ...found, message: typeof message === "function" ? message(found) : message };
    });
  }
  return issues;
}

/**
 * Finishes a validator whose value has its type: words the issues it found itself, runs every check on
 * the value and adds what they found, and returns the value or every issue. It stays synchronous while
 * every check is.
 */
export function finish<T>(
  value: T,
  issues: ValidationIssue[],
  message: Message | undefined,
  checks: readonly AsyncCheck<T>[],
): Maybe<ValidationResult<T>> {
  word(issues, message);
  return chain(collect(checks.map((check) => check(value))), (found) => {
    for (const list of found) {
      // Pushed one by one: spreading a long list into `push` would overflow the stack.
      for (const each of list ?? []) {
        issues.push(each);
      }
    }
    return issues.length > 0 ? failWith(issues) : pass(value);
  });
}

/**
 * Builds a validator for a type: the input must pass `accepts`, then `inspect` reports the validator's
 * own constraints into the list and returns the value, cleaned if the validator cleans it, and then the
 * checks run on that value. Every leaf and format is one of these.
 */
export function leaf<T>(
  expected: string,
  accepts: (input: unknown) => boolean,
  message: Message | undefined,
  checks: readonly AsyncCheck<T>[],
  inspect?: (value: T, issues: ValidationIssue[]) => T,
): (input: unknown) => Maybe<ValidationResult<T>> {
  return (input) => {
    if (!accepts(input)) {
      return failWith(word([typeIssue(expected, input)], message));
    }
    const issues: ValidationIssue[] = [];
    return finish(inspect === undefined ? (input as T) : inspect(input as T, issues), issues, message, checks);
  };
}
