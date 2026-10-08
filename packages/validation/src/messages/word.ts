import { assertText } from "../core/result";
import type { ValidationIssue, ValidationPathSegment } from "../core/types";

/**
 * Message text keyed by issue code, such as `englishMessages` or a translation.
 *
 * A string is used as it is. A function receives the issue, so it can word the message from
 * `params`, and the map it was found in, so it can word an issue nested in `params`, such as the one
 * behind an `invalid_key`, with the same map. This is how messages are worded and localized.
 *
 * The entry `default` words an issue whose code has no entry of its own, such as the code of a custom
 * check, in place of the English "Invalid value".
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
 * Rejects a message map that is not an object, such as `null` or a list, since it is a mistake in the
 * program and not in the input.
 */
export function assertMessages(messages: unknown): void {
  if (typeof messages !== "object" || messages === null || Array.isArray(messages)) {
    const received = messages === null ? "null" : Array.isArray(messages) ? "array" : typeof messages;
    throw new TypeError(`messages must be a message map, such as englishMessages, received ${received}`);
  }
}

/** The entry of a map that words an issue whose code has no entry. */
const DEFAULT_ENTRY = "default";

/** Reads an entry a map has itself, so a code such as `constructor` finds nothing of `Object.prototype`. */
const entryOf = (messages: Messages, key: string): Messages[string] =>
  Object.hasOwn(messages, key) ? messages[key] : undefined;

/** What {@link wordIssue} says when nothing supplies text for an issue. */
const FALLBACK_MESSAGE = "Invalid value";

/**
 * Words an issue with the map given, and no other: the issue's own `message`, the entry for its `code`,
 * the map's `default` entry, then "Invalid value". `formatIssue` is this with the English as the default
 * map; `assert`, `standard` and the wording of a nested issue call this, so a program that never calls
 * `formatIssue` or `flatten` does not bundle the English through them.
 */
export function wordIssue(issue: ValidationIssue, messages: Messages): string {
  assertMessages(messages);
  if (issue.message !== undefined) {
    return issue.message;
  }
  // The entry for the code, then the map's own wording for a code it lacks, which a translation gives so
  // that no issue is worded in English.
  const own = entryOf(messages, issue.code);
  const custom = own === undefined ? entryOf(messages, DEFAULT_ENTRY) : own;
  if (custom === undefined) {
    return FALLBACK_MESSAGE;
  }
  const worded: unknown = typeof custom === "function" ? custom(issue, messages) : custom;
  // A function that returns anything but text, such as a translation lookup that missed, or an entry that
  // is a group of translations, would reach a form or an error as `undefined` or `[object Object]`.
  assertText("message", worded);
  return worded as string;
}
