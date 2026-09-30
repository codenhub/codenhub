import type { Maybe } from "../core/async";
import { leaf, split } from "../core/checks";
import { issue } from "../core/result";
import type { AsyncCheck, Factory, Message, MessageOptions, ValidationResult } from "../core/types";

const isString = (input: unknown): boolean => typeof input === "string";

/**
 * Builds the validator for a string format: `read` returns the value for a string of the format, its
 * canonical spelling or the text itself, and undefined for any other. A non-string fails with
 * `invalid_type`, and any other string with `invalid_format` naming the format. Checks run on the value.
 */
export const stringFormat = (
  format: string,
  read: (text: string) => string | undefined,
  message: Message | undefined,
  checks: readonly AsyncCheck<string>[],
): ((input: unknown) => Maybe<ValidationResult<string>>) =>
  leaf<string>("string", isString, message, checks, (text, issues) => {
    const value = read(text);
    if (value === undefined) {
      issues.push(issue("invalid_format", { format }));
      return text;
    }
    return value;
  });

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
