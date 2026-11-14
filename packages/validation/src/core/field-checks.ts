/*
 * The checks of an object that need only some of its properties, made by `checkFields`. `object` and
 * `objectLike` run every check once every property has passed; these also run while another property
 * fails, as soon as the ones they name have passed, so a rule across two fields of a form is reported
 * with the other fields' issues and not after them.
 */
import { describe } from "./describe";
import type { FieldFailureOf } from "./field-hook";
import { runChecks } from "./finish";
import { FAIL } from "./run";
import type { AsyncCheck } from "./types";
import { tools } from "./wait";

/** A check and the properties it waits for. */
type FieldCheck = readonly [check: AsyncCheck<Record<string, unknown>>, fields: readonly string[]];

/**
 * The checks among `checks` that name the properties they need. One that names a property the shape
 * lacks is a mistake in the schema, such as a misspelling, which would otherwise never run.
 */
function fieldChecksOf(checks: readonly AsyncCheck<Record<string, unknown>>[], keys: readonly string[]): FieldCheck[] {
  const found: FieldCheck[] = [];
  for (const each of checks) {
    const fields = describe(each as AsyncCheck<never>)?.["fields"] as readonly string[] | undefined;
    if (fields !== undefined) {
      const missing = fields.find((field) => !keys.includes(field));
      if (missing !== undefined) {
        throw new TypeError(`checkFields() names a property the object does not have: ${missing}`);
      }
      found.push([each, fields]);
    }
  }
  return found;
}

/**
 * The runner of an object's field checks, which `checkFields` registers with each check it makes. It reads
 * the checks when the object is made, so one that names a property the shape lacks throws then. When a
 * property failed, it runs every field check whose own properties all passed, whose issues follow the
 * ones the object already reported.
 */
export const fieldFailure: FieldFailureOf = (checks, keys) => {
  const fieldChecks = fieldChecksOf(checks, keys);
  return (failed, output, message, from) => {
    const ready = fieldChecks
      .filter(([, fields]) => failed === undefined || !fields.some((field) => failed.includes(field)))
      .map(([each]) => each);
    if (ready.length === 0) {
      return FAIL;
    }
    const found = runChecks(output, ready as readonly AsyncCheck<never>[], message);
    // A check that waits takes the issues of the object with it, as every result that waits does.
    return tools.is(found) ? tools.after(from, found, () => FAIL) : FAIL;
  };
};
