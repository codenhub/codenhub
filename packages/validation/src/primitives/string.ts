import { sourceOfRegExp } from "../core/objects";
import { assertOrder, assertSize, failWith, invalidType, pass, toIssue } from "../core/result";
import type { ValidationIssue, Validator } from "../core/types";

/** Constraints and clean-up for {@link string}. Every option is optional. */
export interface StringOptions {
  /** Requires at least this many characters (UTF-16 code units, as `String.length` counts them). A non-negative integer. */
  min?: number;
  /** Allows at most this many characters. A non-negative integer. */
  max?: number;
  /** Requires exactly this many characters. A non-negative integer. */
  length?: number;
  /** Requires the string to match. The `g` and `y` flags are ignored, so the same validator gives the same answer on every call. */
  pattern?: RegExp;
  /** Requires the string to start with this prefix. */
  startsWith?: string;
  /** Requires the string to end with this suffix. */
  endsWith?: string;
  /** Requires the string to contain this substring. */
  includes?: string;
  /**
   * Removes leading and trailing whitespace before the constraints run, and from the output.
   *
   * @defaultValue false
   */
  trim?: boolean;
  /**
   * Lowercases the string before the constraints run, and in the output. Cannot be combined with `uppercase`.
   *
   * @defaultValue false
   */
  lowercase?: boolean;
  /**
   * Uppercases the string before the constraints run, and in the output. Cannot be combined with `lowercase`.
   *
   * @defaultValue false
   */
  uppercase?: boolean;
}

const tooSmall = (minimum: number, isExact: boolean): ValidationIssue =>
  toIssue({
    code: "too_small",
    params: isExact ? { minimum, exact: true, type: "string" } : { minimum, type: "string" },
  });

const tooBig = (maximum: number, isExact: boolean): ValidationIssue =>
  toIssue({
    code: "too_big",
    params: isExact ? { maximum, exact: true, type: "string" } : { maximum, type: "string" },
  });

const invalidFormat = (format: string, extra: Record<string, unknown> = {}): ValidationIssue =>
  toIssue({ code: "invalid_format", params: { format, ...extra } });

/**
 * Creates a validator for strings.
 *
 * @remarks
 * `trim`, `lowercase` and `uppercase` run first, then every constraint is checked against the
 * cleaned string, and each failing constraint reports its own issue. Formats such as email or URL
 * are validators of their own; combine them with this one using `pipe`.
 *
 * @example
 * ```ts
 * const username = string({ trim: true, min: 3, max: 30 });
 * username("  ada  "); // { ok: true, value: "ada" }
 * username(42); // { ok: false, error: { issues: [{ code: "invalid_type", ... }] } }
 * ```
 *
 * @param options - Constraints and clean-up to apply.
 * @returns A validator that produces a string.
 * @throws {RangeError} When `min`, `max` or `length` is not a non-negative integer, or no length satisfies them together.
 * @throws {TypeError} When both `lowercase` and `uppercase` are set, or `pattern` is not a regular expression.
 */
export function string(options: StringOptions = {}): Validator<string> {
  const { min, max, length, pattern, startsWith, endsWith, includes, trim, lowercase, uppercase } = options;
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
  if (lowercase === true && uppercase === true) {
    throw new TypeError("string() cannot lowercase and uppercase at once");
  }
  // Checked with the built-in getter, so a regular expression from another realm, such as an iframe, is
  // one too, and an object that merely has `source` and `flags` is not.
  const source = pattern === undefined ? undefined : sourceOfRegExp(pattern);
  if (pattern !== undefined && source === undefined) {
    throw new TypeError(`pattern must be a RegExp, received ${pattern === null ? "null" : typeof pattern}`);
  }
  const stateless = pattern && new RegExp(source as string, pattern.flags.replace(/[gy]/g, ""));

  return (input) => {
    if (typeof input !== "string") {
      return invalidType("string", input);
    }

    let value = input;
    if (trim === true) {
      value = value.trim();
    }
    if (lowercase === true) {
      value = value.toLowerCase();
    } else if (uppercase === true) {
      value = value.toUpperCase();
    }

    const issues: ValidationIssue[] = [];
    if (min !== undefined && value.length < min) {
      issues.push(tooSmall(min, false));
    }
    if (max !== undefined && value.length > max) {
      issues.push(tooBig(max, false));
    }
    if (length !== undefined && value.length !== length) {
      issues.push(value.length < length ? tooSmall(length, true) : tooBig(length, true));
    }
    if (stateless !== undefined && !stateless.test(value)) {
      issues.push(invalidFormat("regex", { pattern: String(pattern) }));
    }
    if (startsWith !== undefined && !value.startsWith(startsWith)) {
      issues.push(invalidFormat("startsWith", { value: startsWith }));
    }
    if (endsWith !== undefined && !value.endsWith(endsWith)) {
      issues.push(invalidFormat("endsWith", { value: endsWith }));
    }
    if (includes !== undefined && !value.includes(includes)) {
      issues.push(invalidFormat("includes", { value: includes }));
    }
    return issues.length > 0 ? failWith(issues) : pass(value);
  };
}
