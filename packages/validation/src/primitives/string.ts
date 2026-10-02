import { leaf, split } from "../core/checks";
import { assertOption, assertOrder, assertSize, issue } from "../core/result";
import type { Factory, MessageOptions, ValidationIssue } from "../core/types";

/**
 * Constraints and clean-up for {@link string}. Every option is optional. Rarer constraints, such as a
 * pattern or a prefix, are checks given after the options.
 */
export interface StringOptions extends MessageOptions {
  /** Requires at least this many characters (UTF-16 code units, as `String.length` counts them). A non-negative integer. */
  min?: number;
  /** Allows at most this many characters. A non-negative integer. */
  max?: number;
  /** Requires exactly this many characters. A non-negative integer. */
  length?: number;
  /**
   * Removes leading and trailing whitespace before the constraints run, and from the output.
   *
   * @defaultValue false
   */
  trim?: boolean;
  /**
   * Converts the string to lowercase or uppercase before the constraints run, and in the output. To
   * require a case without changing the string, use the `lowercase()` or `uppercase()` check.
   */
  case?: "lower" | "upper";
}

const isString = (input: unknown): boolean => typeof input === "string";

const lengthIssue = (code: "too_small" | "too_big", bound: number, isExact: boolean): ValidationIssue =>
  issue(code, {
    [code === "too_small" ? "minimum" : "maximum"]: bound,
    ...(isExact && { exact: true }),
    type: "string",
  });

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
  const [{ min, max, length, trim, case: letterCase, message }, checks] = split<StringOptions, string>(args);
  for (const [name, size] of [
    ["Minimum length", min],
    ["Maximum length", max],
    ["Length", length],
  ] as const) {
    if (size !== undefined) {
      assertSize(name, size);
    }
  }
  assertOrder("min", min, "max", max);
  assertOrder("min", min, "length", length);
  assertOrder("length", length, "max", max);
  assertOption("trim", trim, "boolean");
  if (letterCase !== undefined && letterCase !== "lower" && letterCase !== "upper") {
    throw new TypeError(`case must be "lower" or "upper", received "${String(letterCase)}"`);
  }

  return leaf<string>("string", isString, message, checks, (input, issues) => {
    let value = trim === true ? input.trim() : input;
    if (letterCase !== undefined) {
      value = letterCase === "lower" ? value.toLowerCase() : value.toUpperCase();
    }
    if (min !== undefined && value.length < min) {
      issues.push(lengthIssue("too_small", min, false));
    }
    if (max !== undefined && value.length > max) {
      issues.push(lengthIssue("too_big", max, false));
    }
    if (length !== undefined && value.length !== length) {
      issues.push(
        value.length < length ? lengthIssue("too_small", length, true) : lengthIssue("too_big", length, true),
      );
    }
    return value;
  });
}) as Factory<string, StringOptions>;
