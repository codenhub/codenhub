/*
 * How `object` and `objectLike` reach the checks `checkFields` makes without bundling what runs them. Each
 * such check is registered here by `checkFields` with the function that builds its runner, so a program that
 * never calls `checkFields` carries only this lookup.
 */
import type { Maybe } from "./async";
import type { Place } from "./nesting";
import type { AsyncCheck, Message, ValidationErr, ValidationIssue, ValidationResult } from "./types";

/**
 * Fails an object some of whose properties failed, with their `issues` and those of every field check that
 * can run on `output`, which holds the properties that passed.
 */
export type FieldFailure = (
  issues: ValidationIssue[],
  settled: readonly ValidationResult<unknown>[],
  output: Record<string, unknown>,
  message: Message | undefined,
  place: Place,
) => Maybe<ValidationErr>;

/** Builds the {@link FieldFailure} of an object from its checks and the keys of its shape. */
export type FieldFailureOf = (
  checks: readonly AsyncCheck<Record<string, unknown>>[],
  keys: readonly string[],
) => FieldFailure;

const builders = new WeakMap<object, FieldFailureOf>();

/** Registers a check made by `checkFields` with what builds its runner, and returns the check. */
export function withFieldFailure<T extends object>(check: T, build: FieldFailureOf): T {
  builders.set(check, build);
  return check;
}

/**
 * What an object fails with, for its checks and the keys of its shape: the runner of its field checks, when
 * it has one, which also refuses a check that names a property the shape lacks, or undefined.
 */
export function fieldFailureOf(
  checks: readonly AsyncCheck<Record<string, unknown>>[],
  keys: readonly string[],
): FieldFailure | undefined {
  for (const each of checks) {
    const build = builders.get(each);
    if (build !== undefined) {
      return build(checks, keys);
    }
  }
  return undefined;
}
