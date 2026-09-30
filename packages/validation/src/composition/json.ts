import { assertFunction, failIssue, invalidType, pass } from "../core/result";
import type { AnyValidator, Composed, Infer, Validator } from "../core/types";

/**
 * Creates a validator for text that holds JSON: it parses the text, then optionally validates what
 * was parsed.
 *
 * @remarks
 * A non-string fails with `invalid_type`, and text that is not valid JSON fails with
 * `invalid_format` and `{ format: "json" }`. Issues from `validator` have paths relative to the
 * parsed value. Objects parsed from JSON are plain objects, so a `__proto__` key is data. Without
 * `validator` the result is `unknown`.
 *
 * @example
 * ```ts
 * const settings = json(object({ theme: oneOf(["light", "dark"]) }));
 * settings('{"theme":"dark"}'); // { ok: true, value: { theme: "dark" } }
 * settings("{oops"); // { ok: false, ... }, code "invalid_format"
 * ```
 *
 * @typeParam TValidator - The validator for the parsed value.
 * @param validator - Validates the parsed value.
 * @returns A validator that produces what `validator` produces, or `unknown` without one.
 * @throws {TypeError} When `validator` is given and is not a function.
 */
export function json(): Validator<unknown>;
export function json<TValidator extends AnyValidator>(validator: TValidator): Composed<TValidator, Infer<TValidator>>;
export function json(validator?: AnyValidator): AnyValidator {
  if (validator !== undefined) {
    assertFunction("validator", validator);
  }
  return (input) => {
    if (typeof input !== "string") {
      return invalidType("string", input);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      return failIssue("invalid_format", { format: "json" });
    }
    return validator === undefined ? pass(parsed) : validator(parsed);
  };
}
