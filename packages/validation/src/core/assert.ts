import { assertMessages, formatIssue, formatPath, type Messages } from "../messages/format-issue";
import { isThenable } from "./async";
import { assertOption, ROOT_PATH } from "./result";
import type { ValidationResult, Validator } from "./types";

/** Options for {@link assert}. */
export interface AssertOptions {
  /**
   * What was being validated, written before the problem as it is, such as `"[I18n]"` or
   * `"Router options:"`. Without it the message starts at the path.
   */
  subject?: string;
  /**
   * Wording for issues that carry no message of their own, keyed by issue code, such as
   * `englishMessages` or a map of the wordings the validator can report.
   *
   * @defaultValue An empty map, which words such an issue as "Invalid value".
   */
  messages?: Messages;
}

/**
 * Returns the value a validator produces for an input, or throws when the input is invalid.
 *
 * @remarks
 * It is for input whose being invalid is a mistake of the caller, such as a configuration object: the
 * mistake is thrown where it was made, as any other bad argument is. Input a program is expected to
 * receive invalid, such as a form or a request, is read from the result of calling the validator, which
 * lists every issue instead of throwing for the first.
 *
 * The error names the first issue only. Every issue is on the failure the error carries as its `cause`.
 *
 * @example
 * ```ts
 * const config = object({ locales: array(string({ min: 1 })) });
 * const messages = { invalid_type: invalidTypeMessage, too_small: tooSmallMessage };
 * assert(config, { locales: ["en"] }, { subject: "[I18n]", messages }); // { locales: ["en"] }
 * assert(config, { locales: ["en", 1] }, { subject: "[I18n]", messages });
 * // TypeError: [I18n] locales[1]: Expected string, received number
 * ```
 *
 * @typeParam T - The type the validator produces.
 * @param validator - A synchronous validator.
 * @param input - The value to validate.
 * @param options - The subject of the message and the wording of its issues.
 * @returns The value the validator produced, which is not the input when the validator trims, coerces
 * or transforms.
 * @throws {TypeError} When the validator rejects the input, with the subject, the path of the first
 * issue and its wording as the message, and the failure as the `cause`. Also when the validator turns
 * out to be asynchronous, and, whatever the input, when `subject` is not text or `messages` is not a
 * message map.
 */
export function assert<T>(validator: Validator<T>, input: unknown, options: AssertOptions = {}): T {
  const { subject, messages = {} } = options;
  assertOption("subject", subject, "string");
  // Checked before the input is, so a wrong map is found by the first call and not by the first invalid input.
  assertMessages(messages);
  const result: unknown = validator(input);
  if (isThenable(result)) {
    // The promise is abandoned, so a later rejection is not reported as unhandled.
    // oxlint-disable-next-line promise/prefer-await-to-then
    result.then(undefined, () => undefined);
    throw new TypeError("assert() needs a synchronous validator. Call the validator and await its result instead.");
  }
  const outcome = result as ValidationResult<T>;
  if (outcome.ok) {
    return outcome.value;
  }
  const [first] = outcome.error.issues;
  // A path a validator written by hand left out is the value's own, as everywhere else.
  const where = formatPath(first.path ?? ROOT_PATH);
  const problem = `${where === "" ? "" : `${where}: `}${formatIssue(first, messages)}`;
  throw new TypeError(subject === undefined ? problem : `${subject} ${problem}`, { cause: outcome.error });
}
