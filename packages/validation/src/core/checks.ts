import { chain, collect, detached, runEach, type Maybe } from "./async";
import { described, type Description } from "./describe";
import { placeAll, type Place } from "./nesting";
import { isPlainObject } from "./objects";
import { assertText, failWith, isPath, issue, pass, typeIssue } from "./result";
import type {
  AsyncCheck,
  Check,
  Message,
  MessageOptions,
  ValidationErr,
  ValidationIssue,
  ValidationResult,
} from "./types";

/**
 * Separates the arguments of a factory, `(options?, ...checks)`, into its options and its checks. A plain
 * object is the options and a function is a check, so the options can be left out. Anything else in
 * first place, such as a string, a list or a regular expression, is a mistake in the schema: read as
 * options, `string("abc")` would take the string's `length` as its own, `array(item, [unique()])` would
 * drop the check, and `string(/^a/)` would accept every string. `null` is no options, as `undefined` is.
 * An option whose name is not `message` or one of `known`, the names the factory reads separated by
 * spaces, is a mistake too, such as `max` written `maxx`, which would otherwise leave the limit unset.
 * The error names the option and not the ones there are, which the types list, since every validator carries it.
 */
export function split<TOptions extends MessageOptions, T>(
  args: readonly unknown[],
  known = "",
): [options: TOptions, checks: AsyncCheck<T>[]] {
  const [first, ...rest] = args;
  const [options, checks] = typeof first === "function" ? [{}, args] : [first ?? {}, rest];
  const message: unknown = (options as MessageOptions | null)?.message;
  if (
    !isPlainObject(options) ||
    (message !== undefined && typeof message !== "string" && typeof message !== "function") ||
    checks.some((check) => typeof check !== "function")
  ) {
    // A mistake in the schema, reported now rather than on the first input. One condition and one text,
    // since every validator carries them.
    throw new TypeError("Options must be an object whose message is text or a function, and checks functions");
  }
  // Splitting no names gives one empty name, which no option is.
  const names = `message ${known}`.split(" ");
  const unknown = Object.keys(options).find((name) => name === "" || !names.includes(name));
  if (unknown !== undefined) {
    throw new TypeError(`Unknown option ${unknown}`);
  }
  // Copied, so changing the object after the validator is made changes nothing, whether the validator reads
  // an option once or, as a composer reads its message and sizes, on every call.
  return [Object.freeze({ ...(options as object) }) as TOptions, checks as AsyncCheck<T>[]];
}

/** What a check written by hand that returns something it may not is told. */
const CHECK_RESULT_ERROR = "A check must return undefined or a list of issues";

/**
 * Rejects wording that is neither text nor a function, such as a translation that turned out to be a
 * group of them, which would otherwise reach a form as `[object Object]`. Undefined is no wording.
 */
export function assertMessage(message: unknown): void {
  if (message !== undefined && typeof message !== "string" && typeof message !== "function") {
    throw new TypeError(`message must be text or a function, received ${message === null ? "null" : typeof message}`);
  }
}

/**
 * Gives a validator's wording, when it has one, to every issue in the list that has none of its own,
 * such as one a check given no message reported. The issues are replaced in place.
 */
export function word(issues: ValidationIssue[], message: Message | undefined): ValidationIssue[] {
  if (message !== undefined) {
    issues.forEach((found, index) => {
      if (found.message === undefined) {
        const worded: unknown = typeof message === "function" ? message(found) : message;
        // A function that returns anything but text, such as a translation lookup that missed, would put it
        // in the issue, and a form would show `undefined` or `[object Object]`.
        assertText("message", worded);
        issues[index] = { ...found, message: worded as string };
      }
    });
  }
  return issues;
}

/**
 * Words issues a composer found itself, written relative to its value, and then moves them to the `place`
 * it was reached at, so a message function is given the issue as that composer reports it, as a leaf's is.
 */
export const report = (
  issues: readonly ValidationIssue[],
  place: Place,
  message: Message | undefined,
): ValidationIssue[] => placeAll(word([...issues], message), place);

/**
 * Finishes a validator whose value has its type. When the validator found issues of its own, such as a
 * string longer than `max`, it reports them and runs no check, so a bound keeps a long value from a costly
 * check and an invalid one from a lookup. Otherwise it runs every check on the value, words every issue
 * that has no wording of its own, and returns the value or every issue. It stays synchronous while every
 * check is, and while its own issues stop the checks. A check's issues are copied, so
 * a list the check reuses is never changed, and one written by hand without a path, or with an undefined
 * one, is at the value, and without a code is `"custom"`, as `fail()` gives it. A check written by hand
 * that returns anything but nothing or a list, such as `false`, or a list holding something that is not
 * an object, such as `null`, or an issue whose path is not a list of keys and indexes, such as `"confirm"`,
 * is a bug, and throws saying so rather than failing later on what it returned.
 */
export function finish<T>(
  value: T,
  issues: ValidationIssue[],
  message: Message | undefined,
  checks: readonly AsyncCheck<T>[],
): Maybe<ValidationResult<T>> {
  if (issues.length > 0) {
    return failWith(word(issues, message));
  }
  if (checks.length === 0) {
    // The usual case, and every leaf and composer ends here, so nothing is made for checks there are none of.
    return pass(value);
  }
  return chain(collect(runEach(checks.length, (index) => detached(checks[index] as AsyncCheck<T>, value))), (found) => {
    for (const list of found) {
      if (list !== undefined && !Array.isArray(list)) {
        throw new TypeError(CHECK_RESULT_ERROR);
      }
      // Pushed one by one: spreading a long list into `push` would overflow the stack.
      for (const each of list ?? []) {
        // An array is an object too, and spread into an issue would give it keys `0`, `1` and so on. A path
        // that is not a list, such as `"confirm"`, would break a composer that moves the issue to its place.
        if (
          typeof each !== "object" ||
          each === null ||
          Array.isArray(each) ||
          (each.path !== undefined && !isPath(each.path))
        ) {
          throw new TypeError(CHECK_RESULT_ERROR);
        }
        issues.push({ ...each, code: each.code ?? "custom", path: each.path ?? [] });
      }
    }
    return issues.length > 0 ? failWith(word(issues, message)) : pass(value);
  });
}

/**
 * Builds a validator for a type: the input must pass `accepts`, then `inspect` reports the validator's
 * own constraints into the list and returns the value, cleaned if the validator cleans it, and then the
 * checks run on that value, once every constraint has passed. Every leaf and format is one of these.
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

/**
 * Builds a built-in check: a value `test` accepts passes, and any other reports one issue with `code`
 * and a copy of `params`, worded by `message` when there is one. A copy for each failure, so a caller
 * that changes the params of one changes no other.
 */
export function rule<T>(
  test: (value: T) => boolean,
  code: string,
  params: Readonly<Record<string, unknown>>,
  message: Message | undefined,
): Check<T> {
  assertMessage(message);
  return described<Check<T>>((value) => (test(value) ? undefined : word([issue(code, { ...params })], message)), {
    kind: "check",
    code,
    params: Object.freeze(params),
  });
}

/**
 * Builds a validator that accepts the values `find` names, producing the declared value `find` returns
 * rather than the input, and reports any other with one `invalid_value` issue whose params `params`
 * makes afresh for each failure, as `literal` and `oneOf` do, where `leaf` would report the type. The
 * declared value is produced because `===` also matches `-0` to `0`, and the type promises the one
 * declared.
 */
export function member<T>(
  find: (input: unknown) => readonly [value: T] | undefined,
  params: () => Readonly<Record<string, unknown>>,
  args: readonly unknown[],
  description: Omit<Description, "options">,
): (input: unknown) => Maybe<ValidationResult<T>> {
  const [options, checks] = split<MessageOptions, T>(args);
  const { message } = options;
  return described(
    (input: unknown) => {
      const found = find(input);
      return found === undefined
        ? failWith(word([issue("invalid_value", params())], message))
        : finish(found[0], [], message, checks);
    },
    { ...description, options, checks },
  );
}

/**
 * Reads what follows a composer's own arguments, options then checks, into the two ends of the
 * composer: `reject` fails with issues the composer found itself, such as a wrong type or size, written
 * relative to its value and moved to the `place` it was reached at, worded by the options' `message`,
 * and `accept` runs the checks on a value once every child has passed, and words what a check found
 * without a message of its own. Issues a child found are never worded here, since they are the child's.
 */
export function tail<TOptions extends MessageOptions, T>(
  args: readonly unknown[],
  known?: string,
): [
  options: TOptions,
  reject: (issues: readonly ValidationIssue[], place: Place) => ValidationErr,
  accept: (value: T, place: Place) => Maybe<ValidationResult<T>>,
  checks: readonly AsyncCheck<T>[],
] {
  const [options, checks] = split<TOptions, T>(args, known);
  return [
    options,
    (issues, place) => failWith(report(issues, place, options.message)),
    // A check reports relative to the value, as for a leaf, and its issues are moved to the place after.
    checks.length === 0
      ? pass
      : (value, place) =>
          chain(finish(value, [], options.message, checks), (result) =>
            result.ok || place === undefined ? result : failWith(placeAll(result.error.issues, place)),
          ),
    checks,
  ];
}
