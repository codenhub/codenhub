/*
 * How a composer reaches a child: through its run, so the child reports into the validation the composer
 * is part of. Every validator carries one, a function written by hand once `validator` made it one.
 */
import { assertFunction } from "./result";
import { RUN, type Run, type Tools } from "./run";
import type { AnyValidator } from "./types";

/** The run a validator this copy of the package made carries, or undefined for any other value. */
export const ownRun = (validator: unknown): Run | undefined =>
  typeof validator === "function" ? (validator as { [RUN]?: Run })[RUN] : undefined;

/**
 * The run of a child, named `name` in the error of one that is not a validator. A function that is none
 * is a mistake in the schema: a factory given where its validator belongs, `string` for `string()`, or
 * a function written by hand that `validator` was not given, or a validator another copy of the package
 * made, which is a function written by hand to this one. What calls such a function, and waits for it,
 * comes with `validator`, so a schema with none carries none of it.
 */
export function runOf(child: AnyValidator, name: string): Run {
  assertFunction(name, child);
  const run = ownRun(child);
  if (run === undefined) {
    throw new TypeError(
      `${name} is not a validator of this copy of the package. A factory is called first, as in string(), and any other function is given to validator()`,
    );
  }
  return run;
}

/** The helpers for results that wait, when one of these runs may wait, or `waits` when a check may. */
export const toolsOf = (runs: readonly (Run | undefined)[], waits?: Tools): Tools | undefined =>
  waits ?? runs.find((run) => run?.w !== undefined)?.w;
