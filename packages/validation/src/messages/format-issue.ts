import type { ValidationFailure, ValidationIssue } from "../core/types";
import { englishMessages } from "./english-messages";
import { assertMessages, formatPath, wordIssue, type Messages } from "./word";

export { formatPath, type Messages } from "./word";

/**
 * Turns an issue into text a person can read.
 *
 * @remarks
 * The text comes from the first of these that exists: the issue's own `message`, an entry for its
 * `code` in `messages`, the entry `default` of `messages`, then the generic "Invalid value". The map is
 * `englishMessages` unless another is given, such as `portugueseMessages`, a map of your own, or the
 * English spread with your own entries. A program that calls `formatIssue` bundles the English even when
 * it passes another map, since the default is referenced.
 *
 * @example
 * ```ts
 * const result = number({ min: 18 })(15);
 * if (!result.ok) {
 *   formatIssue(result.error.issues[0]); // "Must be at least 18"
 *   formatIssue(result.error.issues[0], portugueseMessages); // "Deve ser no mínimo 18"
 * }
 * ```
 *
 * @param issue - The issue to describe.
 * @param messages - Text for the codes it names, `englishMessages` unless given, or `{}` for none.
 * @returns The message.
 * @throws {TypeError} When `messages` is not a message map, such as `null`, or the entry that words an
 * issue is neither text nor a function that returns text.
 */
export function formatIssue(issue: ValidationIssue, messages: Messages = englishMessages): string {
  return wordIssue(issue, messages);
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
 * keyed by their {@link formatPath} notation in `fieldErrors`, an object with no prototype so that a field
 * named like an `Object.prototype` member cannot collide with it. Test for a field with `in` or
 * `Object.hasOwn`, since it has no `hasOwnProperty`.
 *
 * @param failure - The `error` of a failed result.
 * @param messages - Text for the codes it names, `englishMessages` unless given, as for {@link formatIssue}.
 * @returns The grouped messages.
 * @throws {TypeError} When `messages` is not a message map, such as `null`, or the entry that words an
 * issue is neither text nor a function that returns text.
 */
export function flatten(failure: ValidationFailure, messages: Messages = englishMessages): FlattenedErrors {
  assertMessages(messages);
  // No prototype, so a field named like an Object.prototype member cannot collide with it.
  const fieldErrors = Object.create(null) as Record<string, string[]>;
  const flattened: FlattenedErrors = { formErrors: [], fieldErrors };
  for (const issue of failure.issues) {
    const message = wordIssue(issue, messages);
    // An issue without a path, which a validator written by hand may report, is about the whole value,
    // as everywhere else.
    if (issue.path === undefined || issue.path.length === 0) {
      flattened.formErrors.push(message);
    } else {
      (fieldErrors[formatPath(issue.path)] ??= []).push(message);
    }
  }
  return flattened;
}
