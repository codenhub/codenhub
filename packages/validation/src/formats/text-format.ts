import type { Maybe } from "../core/async";
import { finish, split, word } from "../core/checks";
import { failWith, issue, typeIssue } from "../core/result";
import type { AsyncCheck, Factory, Message, MessageOptions, ValidationResult } from "../core/types";

const isString = (input: unknown): boolean => typeof input === "string";

/**
 * Builds the validator of a format: an input that is not `expected` fails with `invalid_type`, and
 * `read` returns the value for an input of the format, its canonical spelling or the input itself, and
 * undefined for any other, which fails with `invalid_format` naming the format. The checks run only on a
 * value of the format, so a check can rely on it being one, as it can for `url` and `email`.
 */
export const formatLeaf =
  <T>(
    expected: string,
    accepts: (input: unknown) => boolean,
    format: string,
    read: (input: T) => T | undefined,
    message: Message | undefined,
    checks: readonly AsyncCheck<T>[],
  ): ((input: unknown) => Maybe<ValidationResult<T>>) =>
  (input) => {
    if (!accepts(input)) {
      return failWith(word([typeIssue(expected, input)], message));
    }
    const value = read(input as T);
    return value === undefined
      ? failWith(word([issue("invalid_format", { format })], message))
      : finish(value, [], message, checks);
  };

/** Builds the validator for a string format, as {@link formatLeaf} does for a string. */
export const stringFormat = (
  format: string,
  read: (text: string) => string | undefined,
  message: Message | undefined,
  checks: readonly AsyncCheck<string>[],
): ((input: unknown) => Maybe<ValidationResult<string>>) =>
  formatLeaf<string>("string", isString, format, read, message, checks);

/**
 * Makes the factory of a format whose only option is `message`. A module may export what it returns as
 * `/* @__PURE__ *\/ formatFactory(...)`, since bundlers drop a call marked pure when nothing uses it.
 */
export const formatFactory = (
  format: string,
  read: (text: string) => string | undefined,
): Factory<string, MessageOptions> =>
  ((...args: unknown[]) => {
    const [{ message }, checks] = split<MessageOptions, string>(args);
    return stringFormat(format, read, message, checks);
  }) as Factory<string, MessageOptions>;
