/*
 * The sync-until-async plumbing. A validator is synchronous exactly when everything it runs is, and
 * these two helpers are how composers keep that promise without a second code path: they stay
 * synchronous while nothing is a promise, and switch to promises the moment something is.
 *
 * They are named `chain` and `collect`, never `then`: a module exporting `then` is a thenable, and
 * importing it can hang in some loaders.
 */

/** A value that may still be pending. */
export type Maybe<T> = T | PromiseLike<T>;

/** Tests whether a value is a promise, or anything else with a `then` method. */
export const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  typeof (value as { then?: unknown }).then === "function";

/**
 * Applies `next` to a value that may still be pending, staying synchronous when it is not.
 *
 * A validator's own result is a plain object, so a value with a `then` inside it is not mistaken
 * for a pending result. What `transform` and `refine` get back from the consumer's callback is
 * another matter: a value with a `then` method is treated as a promise there, as `await` would.
 */
export function chain<T, R>(value: Maybe<T>, next: (resolved: T) => Maybe<R>): Maybe<R> {
  // A thenable has to be unwrapped with `then`; the alternative to `await` is the point of this helper.
  // oxlint-disable-next-line promise/prefer-await-to-then, promise/no-callback-in-promise
  return isThenable(value) ? value.then(next) : next(value);
}

/**
 * Gathers the results of several validators, synchronously when none is pending and as one promise
 * otherwise. Results keep the order of the input, never the order in which promises settled.
 */
export function collect<R>(items: readonly Maybe<R>[]): Maybe<R[]> {
  return items.some(isThenable) ? Promise.all(items) : (items as R[]);
}
