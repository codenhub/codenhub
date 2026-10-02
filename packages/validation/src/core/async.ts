/*
 * The sync-until-async plumbing. A validator is synchronous exactly when everything it runs is, and
 * these two helpers are how composers keep that promise without a second code path: they stay
 * synchronous while nothing is a promise, and switch to promises the moment something is.
 *
 * They are named `chain` and `collect`, never `then`: a module exporting `then` is a thenable, and
 * importing it can hang in some loaders.
 *
 * It also tracks a validation: a call such as `schema(input)` and everything it reaches, the
 * continuations after its awaits included. Each `lazy` counts its calls per validation against its own
 * limit, whatever other `lazy` validators the validation reaches, and waiting resets nothing.
 */

/** A value that may still be pending. */
export type Maybe<T> = T | PromiseLike<T>;

/** One validation: how many calls each `lazy` it reached has made, keyed by that `lazy`. */
interface Validation {
  readonly calls: Map<object, number>;
}

const newValidation = (): Validation => ({ calls: new Map() });

/** The validation running now, or undefined between validations. */
let current: Validation | undefined;

/**
 * Runs `work` as part of `validation`, or of the validation running now, or of a new one when none
 * is, and restores the one that was running when it returns.
 */
function enter<A, R>(validation: Validation | undefined, work: (argument: A) => R, argument: A): R {
  const previous = current;
  current = validation ?? previous ?? newValidation();
  try {
    return work(argument);
  } finally {
    current = previous;
  }
}

/**
 * Runs `work` as part of the validation running now, starting one when none is, so everything it
 * reaches shares one count of `lazy` calls.
 */
export const within = <A, R>(work: (argument: A) => R, argument: A): R => enter(undefined, work, argument);

/**
 * Runs a callback the consumer wrote, such as a check's test or a transform's function, apart from
 * the validation running now, so a validator it calls is a validation of its own, with counts of its own.
 */
export function detached<A, R>(callback: (argument: A) => R, argument: A): R {
  const previous = current;
  current = undefined;
  try {
    return callback(argument);
  } finally {
    current = previous;
  }
}

/**
 * Counts a call of the `lazy` named by `key` in the validation running now, and tests whether that
 * `lazy` has now made more calls than `maxCalls`, its own limit.
 */
export function spendCall(key: object, maxCalls: number): boolean {
  // Every composer runs within a validation, so this only guards a call made outside one.
  const { calls } = current ?? newValidation();
  const spent = (calls.get(key) ?? 0) + 1;
  calls.set(key, spent);
  return spent > maxCalls;
}

/** Tests whether a value is a promise, or anything else with a `then` method. */
export const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  typeof (value as { then?: unknown }).then === "function";

/**
 * Applies `next` to a value that may still be pending, staying synchronous when it is not. A pending
 * value's continuation stays part of the validation that was running when it was chained.
 *
 * A validator's own result is a plain object, so a value with a `then` inside it is not mistaken
 * for a pending result. What `transform` and `check` get back from the consumer's callback is
 * another matter: a value with a `then` method is treated as a promise there, as `await` would.
 */
export function chain<T, R>(value: Maybe<T>, next: (resolved: T) => Maybe<R>): Maybe<R> {
  if (!isThenable(value)) {
    return next(value);
  }
  const validation = current;
  // A thenable has to be unwrapped with `then`; the alternative to `await` is the point of this helper.
  // oxlint-disable-next-line promise/prefer-await-to-then, promise/no-callback-in-promise
  return value.then((resolved) => enter(validation, next, resolved));
}

/**
 * Gathers the results of several validators, synchronously when none is pending and as one promise
 * otherwise. Results keep the order of the input, never the order in which promises settled.
 */
export function collect<R>(items: readonly Maybe<R>[]): Maybe<R[]> {
  return items.some(isThenable) ? Promise.all(items) : (items as R[]);
}
