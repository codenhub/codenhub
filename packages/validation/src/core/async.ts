/*
 * The sync-until-async plumbing. A validator is synchronous exactly when everything it runs is, and
 * these two helpers are how composers keep that promise without a second code path: they stay
 * synchronous while nothing is a promise, and switch to promises the moment something is.
 *
 * They are named `chain` and `collect`, never `then`: a module exporting `then` is a thenable, and
 * importing it can hang in some loaders.
 *
 * It also marks a run: one synchronous stretch of a validation, from the call of a composer to its
 * return, or one continuation after an await. `lazy` counts its calls per run, so a whole validation
 * shares one limit however many `lazy` validators it reaches.
 */

/** A value that may still be pending. */
export type Maybe<T> = T | PromiseLike<T>;

/** How many runs are open on the stack. Only the outermost one starts a count. */
let openRuns = 0;

/** How many `lazy` calls the current run has made. */
let runCalls = 0;

/** The `maxCalls` of the first `lazy` the current run reached, which holds the whole run. */
let runLimit: number | undefined;

/**
 * Runs `work` as part of a run, starting one when none is open, so everything it reaches synchronously
 * shares one count of `lazy` calls.
 */
export function within<A, R>(work: (argument: A) => R, argument: A): R {
  if (openRuns === 0) {
    runCalls = 0;
    runLimit = undefined;
  }
  openRuns += 1;
  try {
    return work(argument);
  } finally {
    openRuns -= 1;
  }
}

/**
 * Counts a `lazy` call in the current run and returns the limit when the run has now made more calls
 * than it allows, or undefined while it has not. The first `lazy` a run reaches sets the limit.
 */
export function spendCall(maxCalls: number): number | undefined {
  if (openRuns === 0) {
    // Every composer opens a run, so this is only a guard against a stale count.
    runCalls = 0;
    runLimit = undefined;
  }
  runCalls += 1;
  runLimit ??= maxCalls;
  return runCalls > runLimit ? runLimit : undefined;
}

/** Tests whether a value is a promise, or anything else with a `then` method. */
export const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  typeof (value as { then?: unknown }).then === "function";

/**
 * Applies `next` to a value that may still be pending, staying synchronous when it is not. A pending
 * value's continuation is a run of its own.
 *
 * A validator's own result is a plain object, so a value with a `then` inside it is not mistaken
 * for a pending result. What `transform` and `check` get back from the consumer's callback is
 * another matter: a value with a `then` method is treated as a promise there, as `await` would.
 */
export function chain<T, R>(value: Maybe<T>, next: (resolved: T) => Maybe<R>): Maybe<R> {
  // A thenable has to be unwrapped with `then`; the alternative to `await` is the point of this helper.
  // oxlint-disable-next-line promise/prefer-await-to-then, promise/no-callback-in-promise
  return isThenable(value) ? value.then((resolved) => within(next, resolved)) : next(value);
}

/**
 * Gathers the results of several validators, synchronously when none is pending and as one promise
 * otherwise. Results keep the order of the input, never the order in which promises settled.
 */
export function collect<R>(items: readonly Maybe<R>[]): Maybe<R[]> {
  return items.some(isThenable) ? Promise.all(items) : (items as R[]);
}
