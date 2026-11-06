/*
 * How `object` runs a shape only some of whose properties have a fast test, such as one with a `transform`
 * property, without bundling that run in every program that uses `object`. `transform` and `lazy`, the
 * validators that most often leave a property without a fast test, turn it on when they are called, so a
 * program that calls neither carries only the lookup. An object made before either was called does its full
 * work, and its results are the same either way.
 */
import { runEach, isThenable, type Maybe } from "./async";
import { MISS, type Child, type Fast, type Place } from "./nesting";
import { setOwn } from "./objects";
import { pass } from "./result";
import type { ValidationResult } from "./types";

/**
 * Runs the properties of an object whose input is a plain object, already read, with no issue of its own:
 * `values` holds what each property read, `present` whether the input had it, and `extra` the properties
 * the shape does not list that the output copies. It gives the output when every property passed and none
 * is pending, and otherwise the result of each property.
 */
export type MixedRun = (
  keys: readonly string[],
  children: readonly Child[],
  fastChildren: readonly (Fast | undefined)[],
  values: unknown[],
  present: readonly boolean[],
  extra: readonly (readonly [string, unknown])[] | undefined,
  place: Place,
) => Record<string, unknown> | Maybe<ValidationResult<unknown>>[];

const runMixed: MixedRun = (keys, children, fastChildren, values, present, extra, place) => {
  // A property whose fast test passes its value is given what the test produced, which is what its child
  // would produce, in place of the value; `asked` stops at the first that misses. Every test is asked
  // before any other property runs, so no consumer code runs for input a fast test can reject.
  let asked = 0;
  for (; asked < values.length; asked += 1) {
    const test = fastChildren[asked];
    const value = test === undefined ? undefined : test(values[asked]);
    if (value === MISS) {
      break;
    }
    if (test !== undefined) {
      values[asked] = value;
    }
  }
  // How many properties lead the list whose result is in `values`.
  let ran = 0;
  if (asked === values.length) {
    // None missed, so each property without a fast test runs here, once, and what passed is put together
    // as it comes. At the first that is pending or failed, its result and those before it go to the work
    // below with the rest, which runs only the properties after it, so none runs twice.
    const output: Record<string, unknown> = {};
    for (; ran < values.length; ran += 1) {
      let value = values[ran];
      if (fastChildren[ran] === undefined) {
        const result = (children[ran] as Child)(value, place, keys[ran] as string);
        values[ran] = result;
        if (isThenable(result) || !result.ok) {
          break;
        }
        value = result.value;
      }
      if (value !== undefined || present[ran]) {
        setOwn(output, keys[ran] as string, value);
      }
    }
    if (ran === values.length) {
      for (const [key, value] of extra ?? []) {
        setOwn(output, key, value);
      }
      return output;
    }
    ran += 1;
  }
  return runEach(values.length, (index) =>
    index < asked && fastChildren[index] !== undefined
      ? pass(values[index])
      : index < ran
        ? (values[index] as Maybe<ValidationResult<unknown>>)
        : (children[index] as Child)(values[index], place, keys[index] as string),
  );
};

let mixedRun: MixedRun | undefined;

/** Turns on the run of {@link mixedRunOf} for every object made after. */
export function useMixedRun(): void {
  mixedRun = runMixed;
}

/** The run an object some of whose properties have no fast test uses, when one was turned on. */
export const mixedRunOf = (): MixedRun | undefined => mixedRun;
