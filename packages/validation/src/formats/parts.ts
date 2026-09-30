import { chain, collect, type Maybe } from "../core/async";
import { finish, word } from "../core/checks";
import { setOwn } from "../core/objects";
import { collectNested, failWith, issue, repeatedKey, typeIssue } from "../core/result";
import type {
  AnyValidator,
  AsyncCheck,
  Message,
  ValidationIssue,
  ValidationPathSegment,
  ValidationResult,
} from "../core/types";

/** A part of a format given to the validator the consumer chose for it: its name, the validator, and what the parser read. */
export type Part = [name: string, validator: AnyValidator, value: unknown];

/** What reading a composite format found: its value and the parts to check, or the issues that make it invalid. */
export type Reading = { value: string; parts: Part[] } | { issues: ValidationIssue[] };

/**
 * The search parameters as an object: each key's value, or with `repeated` every value of every key as
 * an array. Without `repeated`, a key given twice is reported at its path, one issue per key, since a
 * validator that saw one of its values while a server read the other would pass a value nobody checked.
 */
export function readQuery(
  params: URLSearchParams,
  repeated: boolean,
  segments: readonly ValidationPathSegment[] = [],
): { value: Record<string, unknown>; issues: ValidationIssue[] } {
  const value: Record<string, unknown> = {};
  const issues: ValidationIssue[] = [];
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    if (!repeated && all.length > 1) {
      const found = repeatedKey(key);
      issues.push({ ...found, path: [...segments, ...found.path] });
    }
    // Defined as own data, so a key such as `__proto__` is a parameter and not a prototype.
    setOwn(value, key, repeated ? all : all[0]);
  }
  return { value, issues };
}

/**
 * Builds the validator of a composite format, such as a URL or an email address: `read` gives the value
 * and the parts to check, or the issues that make the text invalid. Each part's validator runs on what
 * was read, its issues placed under the part's name and never worded by `message`, which words only the
 * format's own. The checks run once every part has passed. It stays synchronous while every part is.
 */
export function partsFormat(
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
    return chain(collect(parts.map(([, validator, part]) => validator(part))), (results) => {
      const issues: ValidationIssue[] = [];
      results.forEach((result, index) => {
        if (!result.ok) {
          collectNested(issues, result.error.issues, (parts[index] as Part)[0]);
        }
      });
      return issues.length > 0 ? failWith(issues) : finish(value, [], undefined, checks);
    });
  };
}

/** The issue of a composite format whose text is not of the format. */
export const notFormat = (format: string): { issues: ValidationIssue[] } => ({
  issues: [issue("invalid_format", { format })],
});
