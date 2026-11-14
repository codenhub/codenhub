/*
 * What the checks of this package are made of. A check is a function given a value that already passed
 * its validator, which returns nothing, or the issues it found, written relative to that value.
 */
import type { Description } from "./describe";
import type { Finish, Runner } from "./finish";
import { assertText, issue } from "./result";
import { adopt, CHECK, FAIL } from "./run";
import type { Check, Message, ValidationIssue } from "./types";
import type { Word } from "./words";

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
 * Gives a check's wording, when it has one, to every issue in the list that has none of its own. The
 * issues are replaced in place.
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
 * Runs the rules of this package, which neither wait nor run a consumer's code, so nothing is set apart
 * for them and nothing is asked of what they return.
 */
const runRules: Finish = (value, checks, message) => {
  let failed = false;
  for (let index = 0; index < checks.length; index += 1) {
    const list = (checks[index] as Check<unknown>)(value);
    if (list !== undefined) {
      adopt(list, message);
      failed = true;
    }
  }
  return failed ? FAIL : value;
};

const RULES: Runner = { r: runRules };

/**
 * Marks a function as a check, which a validator asks of each one it is given, and gives it what runs
 * the checks of that validator: `runner`, unless it already carries one.
 */
export function carry<TCheck extends object>(check: TCheck, runner: Runner = RULES): TCheck {
  (check as { [CHECK]?: Runner })[CHECK] ??= runner;
  return check;
}

/**
 * Says what a check is, for a reader of the schema, and gives it the default messages of what it reports
 * when the validator it is given to has none for them, so that validator words them as a Standard Schema.
 */
export function toCheck<TCheck extends object>(
  check: TCheck,
  record: Omit<Description, "options">,
  words?: readonly Word[],
): TCheck {
  (check as Record<string, unknown>)["~description"] = Object.freeze(record);
  if (words !== undefined) {
    (check as Record<string, unknown>)["~words"] = words;
  }
  return carry(check);
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
  words?: readonly Word[],
): Check<T> {
  assertMessage(message);
  return toCheck<Check<T>>(
    (value) => (test(value) ? undefined : word([issue(code, { ...params })], message)),
    { kind: "check", code, params: Object.freeze(params) },
    words,
  );
}
