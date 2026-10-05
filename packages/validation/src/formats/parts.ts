import { chain, collect, runEach, type Maybe } from "../core/async";
import { finish, word } from "../core/checks";
import { cap, MAX_ISSUES } from "../core/limit";
import { setOwn } from "../core/objects";
import { assertFunction, failWith, issue, nested, repeatedKey, typeIssue } from "../core/result";
import type { AnyValidator, AsyncCheck, Message, ValidationIssue, ValidationResult } from "../core/types";

/** A part of a format given to the validator the consumer chose for it: its name, the validator, and what the parser read. */
export type Part = [name: string, validator: AnyValidator, value: unknown];

/**
 * What reading a composite format found: its value and the parts to check, or the issues that make the
 * text invalid, which the format's message words.
 */
export type Reading = { value: string; parts: Part[] } | { issues: ValidationIssue[] };

/**
 * The issue of a composite format one of whose parts failed: `invalid_format` at the value's own place,
 * naming the format and the part, with what was found in the part in `params.issues`, its paths relative
 * to the part. A form shows it beside the field the text came from, since a path into text names nothing.
 */
export const partIssue = (format: string, part: string, issues: readonly ValidationIssue[]): ValidationIssue =>
  issue("invalid_format", { format, part, issues: issues.map(nested) });

/** Rejects a part validator that is given and is not a function, such as a hostname written as text. */
export function assertParts(parts: Readonly<Record<string, unknown>>): void {
  for (const [name, validator] of Object.entries(parts)) {
    if (validator !== undefined) {
      assertFunction(name, validator);
    }
  }
}

/**
 * The search parameters as an object: each key's value, or with `repeated` every value of every key as
 * an array. Without `repeated`, a key given twice is reported at its path, one issue per key, since a
 * validator that saw one of its values while a server read the other would pass a value nobody checked.
 * The sender repeats as many keys as it likes, so they are listed up to the limit of a collection.
 * The parameters are read once, so the time it takes grows with their number and no faster.
 */
export function readQuery(
  params: URLSearchParams,
  repeated: boolean,
): { value: Record<string, unknown>; issues: ValidationIssue[] } {
  const byKey = new Map<string, string[]>();
  for (const [key, item] of params) {
    const all = byKey.get(key);
    if (all === undefined) {
      byKey.set(key, [item]);
    } else {
      all.push(item);
    }
  }
  const value: Record<string, unknown> = {};
  const issues: ValidationIssue[] = [];
  for (const [key, all] of byKey) {
    // One past the limit of a collection, which is how the list is known to be cut.
    if (!repeated && all.length > 1 && issues.length <= MAX_ISSUES) {
      issues.push(repeatedKey(key));
    }
    // Defined as own data, so a key such as `__proto__` is a parameter and not a prototype.
    setOwn(value, key, repeated ? all : all[0]);
  }
  return { value, issues: cap(issues, undefined, undefined) };
}

/**
 * Builds the validator of a composite format, such as a URL or an email address: `read` gives the value
 * and the parts to check, or the issues that make the text invalid. Each part's validator runs on what
 * was read, and a part that fails is one {@link partIssue}. Every issue is the format's own, so
 * `message` words it, and the checks run once every part has passed. It stays synchronous while every
 * part is.
 */
export function partsFormat(
  format: string,
  read: (text: string) => Reading,
  message: Message | undefined,
  checks: readonly AsyncCheck<string>[],
): (input: unknown) => Maybe<ValidationResult<string>> {
  return (input) => {
    if (typeof input !== "string") {
      return failWith(word([typeIssue("string", input)], message));
    }
    const reading = read(input);
    if ("issues" in reading) {
      return failWith(word(reading.issues, message));
    }
    const { value, parts } = reading;
    const pending = runEach(parts.length, (index) => {
      const [, validator, part] = parts[index] as Part;
      return validator(part);
    });
    return chain(collect(pending), (results) => {
      const issues: ValidationIssue[] = [];
      results.forEach((result, index) => {
        if (!result.ok) {
          issues.push(partIssue(format, (parts[index] as Part)[0], result.error.issues));
        }
      });
      return issues.length > 0 ? failWith(word(issues, message)) : finish(value, [], message, checks);
    });
  };
}

/** The issue of a composite format whose text is not of the format. */
export const notFormat = (format: string): { issues: ValidationIssue[] } => ({
  issues: [issue("invalid_format", { format })],
});
