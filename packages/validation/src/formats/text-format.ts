import type { Maybe } from "../core/async";
import { leaf } from "../core/checks";
import { issue } from "../core/result";
import type { AsyncCheck, Message, ValidationResult, Validator } from "../core/types";

const isString = (input: unknown): boolean => typeof input === "string";

/**
 * Builds the validator for a string format: `read` returns the value for a string of the format, its
 * canonical spelling or the text itself, and undefined for any other. A non-string fails with
 * `invalid_type`, and any other string with `invalid_format` naming the format.
 */
export const stringFormat = (
  format: string,
  read: (text: string) => string | undefined,
  message?: Message,
  checks: readonly AsyncCheck<string>[] = [],
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
 * Builds the validator for a string format that has one canonical spelling: `canonical` returns it for
 * a string of the format, and undefined for any other.
 */
export const canonicalFormat = (format: string, canonical: (text: string) => string | undefined): Validator<string> =>
  stringFormat(format, canonical) as Validator<string>;

/** Builds the validator for a string format checked as written: a string that `isValid` accepts passes unchanged. */
export const textFormat = (format: string, isValid: (text: string) => boolean): Validator<string> =>
  canonicalFormat(format, (text) => (isValid(text) ? text : undefined));
