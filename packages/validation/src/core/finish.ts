/*
 * The checks of a validator, run on a value that has its type. What runs them comes with the checks
 * themselves: a validator given none carries none of that code, and one given only the rules of this
 * package carries none of the code that waits, which only a check that may wait brings.
 */
import { after, CHECK, count, FAIL, type Tools } from "./run";
import type { AsyncCheck, Message } from "./types";

/**
 * Runs every check on `value` and gives the value, or `FAIL` once every issue is reported, worded by
 * `message` when it has no wording of its own. Every check runs, and their issues keep the order of the
 * checks.
 */
export type Finish = (value: unknown, checks: readonly AsyncCheck<never>[], message: Message | undefined) => unknown;

/** What a check carries: what runs the checks of a validator, and the helpers to wait when it may wait. */
export interface Runner {
  readonly r: Finish;
  readonly w?: Tools;
}

/**
 * What runs these checks, or undefined when there is none to run: the runner of one that may wait when
 * there is one, since it runs the others too, and the runner of the first otherwise.
 */
export function runnerOf(checks: readonly unknown[]): Runner | undefined {
  let found: Runner | undefined;
  for (const check of checks) {
    const runner = (check as { [CHECK]: Runner })[CHECK];
    if (found === undefined || runner.w !== undefined) {
      found = runner;
    }
  }
  return found;
}

/** Runs the checks on a value, which is given back as it is when there is none. */
export const runChecks: Finish = (value, checks, message) => {
  const runner = runnerOf(checks);
  return runner === undefined ? value : runner.r(value, checks, message);
};

/** What finishes a value given these checks, or undefined when there is none to run. */
export const finisherOf = (checks: readonly unknown[]): Finish | undefined => runnerOf(checks)?.r;

const same = <T>(value: T): T => value;

/**
 * The end of a composer whose every child passed: the checks, run on the value it built, whose issues
 * `message` words when they have no wording of their own, or the value as it is when it has no check.
 */
export function accepter(
  checks: readonly AsyncCheck<never>[],
  message: Message | undefined,
): (value: unknown) => unknown {
  const finish = finisherOf(checks);
  return finish === undefined ? same : (value) => finish(value, checks, message);
}

/**
 * What a wrapper gives for what its child did: the value its own checks accept, or what the child gave,
 * as it is, when it has none.
 */
export function endOf(
  checks: readonly AsyncCheck<never>[],
  message: Message | undefined,
  tools: Tools | undefined,
): (value: unknown) => unknown {
  const finish = finisherOf(checks);
  return finish === undefined
    ? same
    : (value) => after(tools, count(), value, (later) => (later === FAIL ? FAIL : finish(later, checks, message)));
}

/** The helpers for results that wait, which a validator given a check that may wait needs. */
export const waitsOf = (checks: readonly unknown[]): Tools | undefined => runnerOf(checks)?.w;
