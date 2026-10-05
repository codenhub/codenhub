import { assertText } from "../core/result";
import type { ValidationFailure, ValidationIssue, ValidationPathSegment } from "../core/types";

/**
 * Message text keyed by issue code, such as `englishMessages` or a translation.
 *
 * A string is used as it is. A function receives the issue, so it can word the message from
 * `params`, and the map it was found in, so it can word an issue nested in `params`, such as the one
 * behind an `invalid_key`, with the same map. This is how messages are worded and localized.
 */
export type Messages = Readonly<
  Record<string, string | ((issue: ValidationIssue, messages: Messages) => string) | undefined>
>;

/**
 * Characters that would make a key read as more than one segment or as an index, and characters that
 * would end or hide a line where the path is written, such as a log line: control characters and the
 * line and paragraph separators. A key holding any of them is quoted, with them escaped.
 */
const AMBIGUOUS_KEY_PATTERN = /[.[\]"\p{Cc}\u2028\u2029]/u;

/**
 * The control characters `JSON.stringify` leaves as they are, `DEL` and the C1 controls, and the line and
 * paragraph separators. It escapes the rest itself.
 */
const UNESCAPED_PATTERN = /[\u007f-\u009f\u2028\u2029]/g;

/** A key as a quoted string literal, every control character and line separator escaped. */
const quote = (key: string): string =>
  JSON.stringify(key).replace(
    UNESCAPED_PATTERN,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

/**
 * Formats a path as dot-and-bracket notation.
 *
 * @remarks
 * A key that is empty or holds `.`, `[`, `]` or `"` is written quoted in brackets, as
 * `["a.b"]`, so no two different paths format the same, and so is one holding a control character or a
 * line separator, escaped, so a key the sender chose cannot break a log line: `["a\\nb"]`. A segment
 * that is neither text nor a number, which only a validator written by hand can put in a path, is
 * written as `String` writes it.
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
    } else if (typeof segment !== "string") {
      formatted += `[${String(segment)}]`;
    } else if (segment === "" || AMBIGUOUS_KEY_PATTERN.test(segment)) {
      formatted += `[${quote(segment)}]`;
    } else {
      formatted += formatted.length > 0 ? `.${segment}` : segment;
    }
  }
  return formatted;
}

/**
 * Rejects a message map that is not an object, such as one left out, which would word every issue
 * "Invalid value" without a word, since it is a mistake in the program and not in the input.
 */
export function assertMessages(messages: unknown): void {
  if (typeof messages !== "object" || messages === null || Array.isArray(messages)) {
    const received = messages === null ? "null" : Array.isArray(messages) ? "array" : typeof messages;
    throw new TypeError(`messages must be a message map, such as englishMessages, received ${received}`);
  }
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
 * map of your own, or both spread together. The map is required, so leaving it out is a compile error
 * and not a form that says "Invalid value" for everything; a program whose issues all carry their own
 * `message` passes `{}`.
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
 * @param messages - Text for the codes it names, such as `englishMessages`, or `{}` for none.
 * @returns The message.
 * @throws {TypeError} When `messages` is not a message map, such as when it was left out, or the entry
 * that words an issue is neither text nor a function that returns text.
 */
export function formatIssue(issue: ValidationIssue, messages: Messages): string {
  assertMessages(messages);
  if (issue.message !== undefined) {
    return issue.message;
  }
  const custom = Object.hasOwn(messages, issue.code) ? messages[issue.code] : undefined;
  if (custom === undefined) {
    return FALLBACK_MESSAGE;
  }
  const worded: unknown = typeof custom === "function" ? custom(issue, messages) : custom;
  // A function that returns anything but text, such as a translation lookup that missed, or an entry that
  // is a group of translations, would reach a form or an error as `undefined` or `[object Object]`.
  assertText("message", worded);
  return worded as string;
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
 * @param messages - Text for the codes it names, as for {@link formatIssue}.
 * @returns The grouped messages.
 * @throws {TypeError} When `messages` is not a message map, such as when it was left out, or the entry
 * that words an issue is neither text nor a function that returns text.
 */
export function flatten(failure: ValidationFailure, messages: Messages): FlattenedErrors {
  assertMessages(messages);
  // No prototype, so a field named like an Object.prototype member cannot collide with it.
  const fieldErrors = Object.create(null) as Record<string, string[]>;
  const flattened: FlattenedErrors = { formErrors: [], fieldErrors };
  for (const issue of failure.issues) {
    const message = formatIssue(issue, messages);
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
