import { settle } from "../composition/items";
import { runOf, toolsOf } from "../core/child";
import { accepter, waitsOf } from "../core/finish";
import { refuseRepeated } from "../core/keys";
import { setOwn } from "../core/objects";
import { issue, nested } from "../core/result";
import { adopt, after, cap, count, cut, FAIL, MAX_ISSUES, refuse, report, straighten, type Run } from "../core/run";
import type { AnyValidator, AsyncCheck, Message, ValidationIssue } from "../core/types";

/** Every part places its own issue, at the text itself. */
const PLACED: readonly undefined[] = [];

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

/**
 * Rejects a part validator that is given and is not a validator of this copy of the package, such as a
 * hostname written as text, by the name of its option.
 */
export function assertParts(parts: Readonly<Record<string, unknown>>): void {
  for (const [name, validator] of Object.entries(parts)) {
    if (validator !== undefined) {
      runOf(validator as AnyValidator, name);
    }
  }
}

/**
 * Entries as an object, the parameters of a query or the fields of a form: each key's value, or with
 * `repeated` every value of every key as an array. Without `repeated`, a key given twice is reported at its path, one issue per key, since a
 * validator that saw one of its values while a server read the other would pass a value nobody checked.
 * The sender repeats as many keys as it likes, so they are listed up to the limit of a collection.
 * The parameters are read once, so the time it takes grows with their number and no faster. The issues
 * are reported into the validation running now, worded by `message`, so a caller tells a failure by
 * their count.
 */
export function readEntries(
  params: Iterable<readonly [string, unknown]>,
  repeated: boolean,
  message: Message | undefined,
): Record<string, unknown> {
  const start = count();
  const byKey = new Map<string, unknown[]>();
  for (const [key, item] of params) {
    const all = byKey.get(key);
    if (all === undefined) {
      byKey.set(key, [item]);
    } else {
      all.push(item);
    }
  }
  const value: Record<string, unknown> = {};
  for (const [key, all] of byKey) {
    // One past the limit of a collection, which is how the list is known to be cut.
    if (!repeated && all.length > 1 && count() - start <= MAX_ISSUES) {
      refuseRepeated(message, key);
    }
    // Defined as own data, so a key such as `__proto__` is a parameter and not a prototype.
    setOwn(value, key, repeated ? all : all[0]);
  }
  if (count() > start) {
    cap(start, message);
  }
  return value;
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
  validators: readonly (AnyValidator | undefined)[],
): Run {
  // `validators` are those the format may give its parts, so the run of each is found now.
  const runs = new Map<AnyValidator, Run>();
  for (const validator of validators) {
    if (validator !== undefined) {
      runs.set(validator, runOf(validator, "part"));
    }
  }
  const tools = toolsOf([...runs.values()], waitsOf(checks));
  const accept = accepter(checks, message);
  const run: Run = (input) => {
    if (typeof input !== "string") {
      return refuse("string", input, message);
    }
    const reading = read(input);
    if ("issues" in reading) {
      return adopt(reading.issues, message);
    }
    const { value, parts } = reading;
    return settle(
      parts.length,
      (index) => {
        const [name, validator, part] = parts[index] as Part;
        // What the part's validator found is relative to the part, so it is held behind an issue of the format.
        return after(tools, count(), (runs.get(validator) as Run)(part), (produced, from) =>
          produced === FAIL
            ? report("invalid_format", { format, part: name, issues: straighten(cut(from) ?? []).map(nested) }, message)
            : produced,
        );
      },
      message,
      tools,
      () => accept(value),
      PLACED,
    );
  };
  run.w = tools;
  return run;
}

/** The issue of a composite format whose text is not of the format. */
export const notFormat = (format: string): { issues: ValidationIssue[] } => ({
  issues: [issue("invalid_format", { format })],
});
