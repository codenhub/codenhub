import { failIssue, invalidType, pass } from "../core/result";
import type { Validator } from "../core/types";

/**
 * Builds the validator every string format shares: a string that `isValid` accepts passes unchanged,
 * a non-string fails with `invalid_type`, and any other string fails with `invalid_format` naming the format.
 */
export function textFormat(format: string, isValid: (text: string) => boolean): Validator<string> {
  return (input) => {
    if (typeof input !== "string") {
      return invalidType("string", input);
    }
    return isValid(input) ? pass(input) : failIssue("invalid_format", { format });
  };
}
