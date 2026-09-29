import type { ValidationFailure, ValidationIssue, ValidationPathSegment } from "../core/types";
import { defaultMessage } from "./default-messages";

/**
 * Replacement or additional message text, keyed by issue code.
 *
 * A string is used as it is. A function receives the issue, so it can word the message from
 * `params` or translate it. This is how messages are localized.
 */
export type Messages = Readonly<Record<string, string | ((issue: ValidationIssue) => string) | undefined>>;

/**
 * Formats a path as dot-and-bracket notation.
 *
 * @example
 * ```ts
 * formatPath(["user", "addresses", 0, "street"]); // "user.addresses[0].street"
 * formatPath([0, "title"]); // "[0].title"
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
    } else {
      formatted += formatted.length > 0 ? `.${segment}` : segment;
    }
  }
  return formatted;
}

/**
 * Turns an issue into text a person can read.
 *
 * @remarks
 * The text comes from the first of these that exists: the issue's own `message`, an entry for its
 * `code` in `messages`, then the built-in English wording. Only this function carries that wording,
 * so a program that never formats an issue does not ship any of it.
 *
 * @example
 * ```ts
 * const result = number({ min: 18 })(15);
 * if (!result.ok) {
 *   formatIssue(result.error.issues[0]); // "Must be at least 18"
 * }
 * ```
 *
 * @param issue - The issue to describe.
 * @param messages - Text that replaces the built-in wording for the codes it names.
 * @returns The message.
 */
export function formatIssue(issue: ValidationIssue, messages?: Messages): string {
  if (issue.message !== undefined) {
    return issue.message;
  }
  const custom = messages?.[issue.code];
  if (custom !== undefined) {
    return typeof custom === "function" ? custom(issue) : custom;
  }
  return defaultMessage(issue);
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
 * @param messages - Text that replaces the built-in wording, as for {@link formatIssue}.
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
