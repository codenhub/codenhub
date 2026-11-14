/*
 * How an object runs the checks of `checkFields` when a property failed, without carrying the code for it:
 * the check brings what builds it, and an object given no such check reaches none of it.
 */
import type { FAIL, Pending } from "./run";
import type { AsyncCheck, Message } from "./types";

/**
 * Ends an object that reported issues since `from`: runs the checks whose properties are not among
 * `failed` on `output`, which holds the properties that passed and may hold a placeholder for one that
 * waited and failed, which those checks do not read, and gives `FAIL`, or a result that waits for it.
 */
export type FieldFailure = (
  failed: readonly string[] | undefined,
  output: Record<string, unknown>,
  message: Message | undefined,
  from: number,
) => typeof FAIL | Pending;

/** Builds the {@link FieldFailure} of an object from its checks and the keys of its shape. */
export type FieldFailureOf = (
  checks: readonly AsyncCheck<Record<string, unknown>>[],
  keys: readonly string[],
) => FieldFailure;

const builders = new WeakMap<object, FieldFailureOf>();

/** Marks a check as one that needs `build` to run when a property failed. */
export function withFieldFailure<T extends object>(check: T, build: FieldFailureOf): T {
  builders.set(check, build);
  return check;
}

/** The {@link FieldFailure} of an object with these checks, or undefined when none of them asked for one. */
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
