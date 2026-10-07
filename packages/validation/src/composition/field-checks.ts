/*
 * The checks of an object that need only some of its properties, made by `checkFields`. `object` and
 * `objectLike` run every check once every property has passed; these also run while another property
 * fails, as soon as the ones they name have passed, so a rule across two fields of a form is reported
 * with the other fields' issues and not after them.
 */
import { chain, type Maybe } from "../core/async";
import { finish } from "../core/checks";
import { describe } from "../core/describe";
import { append, placeAll, type Place } from "../core/nesting";
import { failWith } from "../core/result";
import type { AsyncCheck, Message, ValidationErr, ValidationIssue, ValidationResult } from "../core/types";

/** A check and the positions, in the object's shape, of the properties it waits for. */
export type FieldCheck = readonly [check: AsyncCheck<Record<string, unknown>>, indexes: readonly number[]];

/**
 * The checks among `checks` that name the properties they need, with where each property is in `keys`.
 * One that names a property the shape lacks is a mistake in the schema, such as a misspelling, which would
 * otherwise never run.
 */
export function fieldChecksOf(
  checks: readonly AsyncCheck<Record<string, unknown>>[],
  keys: readonly string[],
): FieldCheck[] {
  const found: FieldCheck[] = [];
  for (const each of checks) {
    const fields = describe(each as AsyncCheck<never>)?.["fields"] as readonly string[] | undefined;
    if (fields !== undefined) {
      const indexes = fields.map((field) => keys.indexOf(field));
      const missing = fields[indexes.indexOf(-1)];
      if (missing !== undefined) {
        throw new TypeError(`checkFields() names a property the object does not have: ${missing}`);
      }
      found.push([each, indexes]);
    }
  }
  return found;
}

/**
 * Fails an object some of whose properties failed, with their `issues` and then those of every field
 * check whose own properties all passed, run on `output`, which holds the properties that did.
 */
export function failWithFields(
  issues: ValidationIssue[],
  fieldChecks: readonly FieldCheck[],
  settled: readonly ValidationResult<unknown>[],
  output: Record<string, unknown>,
  message: Message | undefined,
  place: Place,
): Maybe<ValidationErr> {
  const ready = fieldChecks.filter(([, indexes]) => indexes.every((index) => settled[index]?.ok)).map(([each]) => each);
  if (ready.length === 0) {
    return failWith(issues);
  }
  return chain(finish(output, [], message, ready), (result) => {
    if (!result.ok) {
      // A check reports relative to the object, as everywhere, and its issues are moved to the place after.
      append(issues, placeAll(result.error.issues, place));
    }
    return failWith(issues);
  });
}
