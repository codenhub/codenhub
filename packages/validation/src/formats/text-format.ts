import { failIssue, invalidType, pass } from "../core/result";
import type { Validator } from "../core/types";

/**
 * Builds the validator for a string format that has one canonical spelling: `canonical` returns it for
 * a string of the format, and undefined for any other. The canonical form is the value, so a check made
 * later on it sees what the format means and not how it was typed. A non-string fails with
 * `invalid_type`, and any other string with `invalid_format` naming the format.
 */
export function canonicalFormat(format: string, canonical: (text: string) => string | undefined): Validator<string> {
  return (input) => {
    if (typeof input !== "string") {
      return invalidType("string", input);
    }
    const value = canonical(input);
    return value === undefined ? failIssue("invalid_format", { format }) : pass(value);
  };
}

/** Builds the validator for a string format checked as written: a string that `isValid` accepts passes unchanged. */
export const textFormat = (format: string, isValid: (text: string) => boolean): Validator<string> =>
  canonicalFormat(format, (text) => (isValid(text) ? text : undefined));
