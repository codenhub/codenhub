import type { ValidationFailure, ValidationIssue, ValidationPathSegment } from "../core/types";

/**
 * Message text keyed by issue code, such as `englishMessages` or a translation.
 *
 * A string is used as it is. A function receives the issue, so it can word the message from
 * `params`. This is how messages are worded and localized.
 */
export type Messages = Readonly<Record<string, string | ((issue: ValidationIssue) => string) | undefined>>;

/** Characters that would make a key read as more than one segment, or as an index. */
const AMBIGUOUS_KEY_PATTERN = /[.[\]"]/;

/**
 * Formats a path as dot-and-bracket notation.
 *
 * @remarks
 * A key that is empty or holds `.`, `[`, `]` or `"` is written quoted in brackets, as
 * `["a.b"]`, so no two different paths format the same.
 *
 * @example
 * ```ts
 * formatPath(["user", "addresses", 0, "street"]); // "user.addresses[0].street"
 * formatPath([0, "title"]); // "[0].title"
 * formatPath(["a.b"]); // '["a.b"]'
 * ```
 *
 * @param path - Segments leading to a value.
 * @returns The formatted path, or an empty string for the root.
 */
export function formatPath(path: readonly ValidationPathSegment[]): string {
  let formatted = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      formatted += `[${segment}]`;
    } else if (segment === "" || AMBIGUOUS_KEY_PATTERN.test(segment)) {
      formatted += `[${JSON.stringify(segment)}]`;
    } else {
      formatted += formatted.length > 0 ? `.${segment}` : segment;
    }
  }
  return formatted;
}

/** What {@link formatIssue} says when nothing supplies text for an issue. */
const FALLBACK_MESSAGE = "Invalid value";

/**
 * Turns an issue into text a person can read.
 *
 * @remarks
 * The text comes from the first of these that exists: the issue's own `message`, an entry for its
 * `code` in `messages`, then the generic "Invalid value". The built-in English wording is not carried
 * here, so a program that words its own issues does not bundle it: pass `englishMessages` for it, or a
 * map of your own, or both spread together.
 *
 * @example
 * ```ts
 * const result = number({ min: 18 })(15);
 * if (!result.ok) {
 *   formatIssue(result.error.issues[0], englishMessages); // "Must be at least 18"
 * }
 * ```
 *
 * @param issue - The issue to describe.
 * @param messages - Text for the codes it names, such as `englishMessages`.
 * @returns The message.
 */
export function formatIssue(issue: ValidationIssue, messages?: Messages): string {
  if (issue.message !== undefined) {
    return issue.message;
  }
  const custom = messages !== undefined && Object.hasOwn(messages, issue.code) ? messages[issue.code] : undefined;
  if (custom === undefined) {
    return FALLBACK_MESSAGE;
  }
  return typeof custom === "function" ? custom(issue) : custom;
}

/** Issue messages grouped for display next to form fields. */
export interface FlattenedErrors {
  /** Messages of issues at the root, which belong to no field. */
  formErrors: string[];
  /** Messages grouped by {@link formatPath} notation, such as `user.email`. */
  fieldErrors: Record<string, string[]>;
}

/**
 * Groups the messages of a failure for display: issues at the root go to `formErrors`, the rest are
 * keyed by their {@link formatPath} notation in `fieldErrors`.
 *
 * @param failure - The `error` of a failed result.
 * @param messages - Text for the codes it names, as for {@link formatIssue}.
 * @returns The grouped messages.
 */
export function flatten(failure: ValidationFailure, messages?: Messages): FlattenedErrors {
  // No prototype, so a field named like an Object.prototype member cannot collide with it.
  const fieldErrors = Object.create(null) as Record<string, string[]>;
  const flattened: FlattenedErrors = { formErrors: [], fieldErrors };
  for (const issue of failure.issues) {
    const message = formatIssue(issue, messages);
    if (issue.path.length === 0) {
      flattened.formErrors.push(message);
    } else {
      (fieldErrors[formatPath(issue.path)] ??= []).push(message);
    }
  }
  return flattened;
}
