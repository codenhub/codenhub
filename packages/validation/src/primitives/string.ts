import { assertSizeOptions, sizeIssues } from "../composition/size";
import { leaf, split } from "../core/checks";
import { described } from "../core/describe";
import { assertOption } from "../core/result";
import type { Factory, MessageOptions } from "../core/types";

/**
 * Constraints and clean-up for {@link string}. Every option is optional. Rarer constraints, such as a
 * pattern or a prefix, are checks given after the options.
 */
export interface StringOptions extends MessageOptions {
  /** Requires at least this many characters (UTF-16 code units, as `String.length` counts them). A non-negative integer. */
  min?: number | undefined;
  /** Allows at most this many characters. A non-negative integer. */
  max?: number | undefined;
  /** Requires exactly this many characters. A non-negative integer. */
  length?: number | undefined;
  /**
   * Removes leading and trailing whitespace before the constraints run, and from the output.
   *
   * @defaultValue false
   */
  trim?: boolean | undefined;
  /**
   * Converts the string to lowercase or uppercase before the constraints run, and in the output. To
   * require a case without changing the string, use the `lowercase()` or `uppercase()` check.
   */
  case?: "lower" | "upper" | undefined;
}

const isString = (input: unknown): boolean => typeof input === "string";

/**
 * Creates a validator for strings.
 *
 * @remarks
 * `trim` and `case` run first, then every constraint on the cleaned string, and each failing one reports
 * its own issue. The checks run on it once every constraint has passed, so `max` keeps a long string from
 * a costly `pattern` or a lookup. Formats such as email or URL are validators of their own; combine them
 * with this one using `pipe`.
 *
 * @example
 * ```ts
 * const username = string({ trim: true, min: 3, max: 30, message: "3 to 30 characters" }, pattern(/^\w+$/));
 * username("  ada  "); // { ok: true, value: "ada" }
 * username(42); // { ok: false, error: { issues: [{ code: "invalid_type", ... }] } }
 * string(startsWith("a")); // options can be left out
 * ```
 *
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no length satisfies them together.
 * @throws {TypeError} When `min`, `max` or `length` is not a number, `case` is not `"lower"` or `"upper"`, `trim`
 * is not a boolean, or a check is not a function.
 */
export const string = ((...args: unknown[]) => {
  const [options, checks] = split<StringOptions, string>(args, "min max length trim case");
  const { min, max, length, trim, case: letterCase, message } = options;
  assertSizeOptions(options, "Length");
  assertOption("trim", trim, "boolean");
  if (letterCase !== undefined && letterCase !== "lower" && letterCase !== "upper") {
    throw new TypeError(`case must be "lower" or "upper", received "${String(letterCase)}"`);
  }

  const isPlain =
    trim !== true && letterCase === undefined && min === undefined && max === undefined && length === undefined;
  // Text no option reads is the value as it is, and is passed without a list for issues it cannot have.
  const validator = leaf<string>(
    "string",
    isString,
    message,
    checks,
    isPlain
      ? undefined
      : (input, issues) => {
          let value = trim === true ? input.trim() : input;
          if (letterCase !== undefined) {
            value = letterCase === "lower" ? value.toLowerCase() : value.toUpperCase();
          }
          sizeIssues(value.length, "string", options, issues);
          return value;
        },
  );
  return described(validator, { kind: "string", options, checks });
}) as Factory<string, StringOptions>;
