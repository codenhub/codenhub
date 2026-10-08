/*
 * The checks of an object that need only some of its properties, made by `checkFields`. `object` and
 * `objectLike` run every check once every property has passed; these also run while another property
 * fails, as soon as the ones they name have passed, so a rule across two fields of a form is reported
 * with the other fields' issues and not after them.
 */
import { chain, type Maybe } from "./async";
import { finish } from "./checks";
import { describe } from "./describe";
import type { FieldFailureOf } from "./field-hook";
import { append, placeAll, type Place } from "./nesting";
import { failWith } from "./result";
import type { AsyncCheck, Message, ValidationErr, ValidationIssue, ValidationResult } from "./types";

/** A check and the positions, in the object's shape, of the properties it waits for. */
type FieldCheck = readonly [check: AsyncCheck<Record<string, unknown>>, indexes: readonly number[]];

/**
 * The checks among `checks` that name the properties they need, with where each property is in `keys`.
 * One that names a property the shape lacks is a mistake in the schema, such as a misspelling, which would
 * otherwise never run.
 */
function fieldChecksOf(checks: readonly AsyncCheck<Record<string, unknown>>[], keys: readonly string[]): FieldCheck[] {
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
function failWithFields(
  issues: ValidationIssue[],
  fieldChecks: readonly FieldCheck[],
  settled: readonly ValidationResult<unknown>[],
  output: Record<string, unknown>,
  message: Message | undefined,
  place: Place,
): Maybe<ValidationErr> {
  if (fieldChecks.length === 0) {
    return failWith(issues);
  }
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

/**
 * The runner of an object's field checks, which `checkFields` registers with each check it makes. It reads
 * the checks when the object is made, so one that names a property the shape lacks throws then.
 */
export const fieldFailure: FieldFailureOf = (checks, keys) => {
  const fieldChecks = fieldChecksOf(checks, keys);
  return (issues, settled, output, message, place) =>
    failWithFields(issues, fieldChecks, settled, output, message, place);
};
