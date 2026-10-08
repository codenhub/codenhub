/*
 * What the message map of every language reads from an issue the same way: its params, the issue it quotes,
 * the moment of a date limit and the option of a union the input was meant for. The words are each map's own.
 */
import { timeOf } from "../core/objects";
import type { ValidationIssue } from "../core/types";
import { formatPath, wordIssue, type Messages } from "./word";

/** Reads an entry of a table of words, so a name such as `constructor` is no entry of `Object.prototype`. */
export const entryOf = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined;

/** The most allowed values a message lists before it says how many more there are. */
const LISTED_VALUES = 10;

/**
 * Lists allowed values for a sentence, the first ten and what `more` says of the count of the rest, so a
 * long list stays a sentence.
 */
export const listOf = (
  values: readonly unknown[],
  word: (value: unknown) => string,
  more: (count: number) => string,
): string => {
  const listed = values.slice(0, LISTED_VALUES).map(word).join(", ");
  return values.length > LISTED_VALUES ? `${listed} ${more(values.length - LISTED_VALUES)}` : listed;
};

/**
 * Words an issue quoted inside another, such as an option's inside a union or a part's inside a URL, with
 * where it sits inside the value the outer issue is shown at, so `width: Must be at least 1` says which
 * property of the box to fix.
 */
export const quote = (found: ValidationIssue, messages: Messages): string =>
  `${found.path?.length > 0 ? `${formatPath(found.path)}: ` : ""}${wordIssue(found, messages)}`;

/** Reads a parameter as text, so a missing or unusual one degrades to a readable message and not a crash. */
export const param = (issue: ValidationIssue, name: string): string => String(issue.params?.[name]);

/** Writes a literal value the way it would appear in code, so `"a"` and `a` are not confused. */
export const formatValue = (value: unknown): string =>
  typeof value === "string" ? JSON.stringify(value) : typeof value === "bigint" ? `${value}n` : String(value);

/**
 * The moment a limit of a date is written as, or `undefined` for a limit of anything else. A `Date` of
 * any realm is written as its moment, whatever `type` says, and the bound of a date as it is otherwise:
 * the ISO text `JSON.stringify` made of a `Date` when the issue was sent on reads the same, and text is
 * never read as a date, which would depend on the clock of the machine wording it.
 */
export const momentOf = (limit: unknown, type: string): string | undefined => {
  const time = timeOf(limit);
  if (type !== "date" && time === undefined) {
    return undefined;
  }
  return time === undefined || Number.isNaN(time) ? String(limit) : new Date(time).toISOString();
};

/**
 * Tests whether what an option of a union found says only that the input is not of its kind: one issue
 * at the value itself, of the wrong type, or naming the values a `literal` or `oneOf` accepts. An issue
 * without a path, which a validator written by hand may report, is at the value, as everywhere else.
 */
const isOtherKind = (issues: readonly ValidationIssue[]): boolean => {
  const [only] = issues;
  return (
    issues.length === 1 &&
    only !== undefined &&
    !(only.path?.length > 0) &&
    (only.code === "invalid_type" ||
      (only.code === "invalid_value" &&
        only.params !== undefined &&
        ("expected" in only.params || Array.isArray(only.params["options"]))))
  );
};

/** Tests whether an issue is a limit of `lazy` that stopped the validation, rather than a fault of the input. */
const isLazyLimit = (found: ValidationIssue | null | undefined): boolean =>
  found?.code === "too_big" && (found.params?.["type"] === "depth" || found.params?.["type"] === "calls");

/**
 * The issue that says what is wrong with an input no option of a union accepted, or `undefined` when no
 * option is the one meant. When the input was of the kind of exactly one option, such as text for
 * `union([literal(""), email()])`, it is that option's first issue. A limit of `lazy` an option found
 * comes before that, since it stopped the validation whatever the input holds.
 */
export const meantIssue = (issue: ValidationIssue): ValidationIssue | undefined => {
  const found = (issue.params?.["issues"] ?? []) as readonly (readonly ValidationIssue[])[];
  const lists = Array.isArray(found) ? found.filter((issues) => Array.isArray(issues)) : [];
  // The input may be valid and only too large, which no other option's issue says.
  const limit = lists.flat().find(isLazyLimit);
  const meant = lists.filter((issues) => !isOtherKind(issues));
  const [first] = limit === undefined ? (meant.length === 1 ? (meant[0] as readonly ValidationIssue[]) : []) : [limit];
  return first;
};
